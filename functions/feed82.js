export async function onRequestGet(context) {

  const apiKey = context.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "YOUTUBE_API_KEY is not available."
    }, 500);
  }

  // Each URL is one batch of up to 20 channels.
  // Cache successful batches for 30 minutes.
  const requestUrl = new URL(context.request.url);
  const batchText = requestUrl.searchParams.get("batch") ?? "0";

  if (!/^(0|[1-9]\d*)$/.test(batchText)) {
    return jsonResponse({
      success: false,
      error: "Invalid batch number."
    }, 400);
  }

  const batch = Number(batchText);
  const cacheUrl = new URL(requestUrl.pathname, requestUrl.origin);
  cacheUrl.searchParams.set("batch", String(batch));

  const cacheKey = new Request(cacheUrl.toString(), {
    method: "GET"
  });

  const cache = caches.default;
  const cached = await cache.match(cacheKey);

  if (cached) return cached;

  try {

    // ============================================================
    // STEP 1: Read our source registry
    // ============================================================

    const registryUrl =
      new URL("/82sources.json", context.request.url);

    const registryResponse =
      await context.env.ASSETS.fetch(registryUrl);

    if (!registryResponse.ok) {
      return jsonResponse({
        success: false,
        error: "Could not load 82sources.json.",
        status: registryResponse.status
      }, 500);
    }

    const sources = await registryResponse.json();

    // ============================================================
    // STEP 2: Select valid YouTube sources
    // ============================================================

    const youtubeSources = sources.filter(source =>
      source.type === "youtube" &&
      source.channelId
    );

    if (!youtubeSources.length) {
      return jsonResponse({
        success: false,
        error: "No valid YouTube sources found in registry."
      }, 500);
    }

    const batchSize = 20;
    const totalBatches =
      Math.ceil(youtubeSources.length / batchSize);

    if (batch >= totalBatches) {
      return jsonResponse({
        success: false,
        error: "Batch out of range.",
        totalBatches
      }, 400);
    }

    const selectedSources = youtubeSources.slice(
      batch * batchSize,
      (batch + 1) * batchSize
    );

    const channelIds =
      selectedSources.map(source => source.channelId);

    // ============================================================
    // STEP 3: Retrieve channel information
    // ============================================================

    const channelsUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      "?part=snippet,contentDetails" +
      "&id=" + encodeURIComponent(channelIds.join(",")) +
      "&key=" + encodeURIComponent(apiKey);

    const channelsResponse = await fetch(channelsUrl);
    const channelsData = await channelsResponse.json();

    if (!channelsResponse.ok) {
      return jsonResponse({
        success: false,
        error: "Could not retrieve YouTube channels.",
        youtube: channelsData
      }, channelsResponse.status);
    }

    // ============================================================
    // STEP 4: Match channels to our registry
    // ============================================================

    const sourceMap = {};

    for (const source of selectedSources) {
      sourceMap[source.channelId] = source;
    }

    // ============================================================
    // STEP 5: Retrieve 15 newest uploads per channel
    // ============================================================

    const playlistRequests =
      (channelsData.items || []).map(async channel => {

        const uploadsPlaylistId =
          channel.contentDetails
            ?.relatedPlaylists
            ?.uploads;

        if (!uploadsPlaylistId) {
          return [];
        }

        const playlistUrl =
          "https://www.googleapis.com/youtube/v3/playlistItems" +
          "?part=snippet,contentDetails" +
          "&playlistId=" +
          encodeURIComponent(uploadsPlaylistId) +
          "&maxResults=15" +
          "&key=" +
          encodeURIComponent(apiKey);

        const response = await fetch(playlistUrl);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            "Could not retrieve uploads for " +
            (channel.snippet?.title || channel.id)
          );
        }

        return (data.items || []).map(item => ({
          channelId: channel.id,
          youtubeChannelTitle:
            channel.snippet?.title || "",
          uploadsPlaylistId: uploadsPlaylistId,
          item: item
        }));
      });

    const playlistResults =
      await Promise.all(playlistRequests);

    const rawVideos = playlistResults.flat();

    // ============================================================
    // STEP 6: Collect video IDs
    // ============================================================

    const videoIds = rawVideos
      .map(entry => entry.item.contentDetails?.videoId)
      .filter(Boolean);

    if (!videoIds.length) {
      return jsonResponse({
        success: true,
        registrySourceCount: sources.length,
        youtubeSourceCount: selectedSources.length,
        totalYoutubeSourceCount: youtubeSources.length,
        batch,
        totalBatches,
        returnedChannelCount:
          channelsData.items?.length || 0,
        videoCount: 0,
        videos: []
      });
    }

    // ============================================================
    // STEP 7: Retrieve video durations
    // ============================================================

    const videoIdChunks = chunkArray(videoIds, 50);

    const videoDetailRequests =
      videoIdChunks.map(async chunk => {

        const videosUrl =
          "https://www.googleapis.com/youtube/v3/videos" +
          "?part=contentDetails" +
          "&id=" +
          encodeURIComponent(chunk.join(",")) +
          "&key=" +
          encodeURIComponent(apiKey);

        const response = await fetch(videosUrl);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            "Could not retrieve video details."
          );
        }

        return data.items || [];
      });

    const videoDetailResults =
      await Promise.all(videoDetailRequests);

    const videoDetails = videoDetailResults.flat();

    // ============================================================
    // STEP 8: Create duration lookup
    // ============================================================

    const durationMap = {};

    for (const video of videoDetails) {
      durationMap[video.id] =
        formatDuration(video.contentDetails?.duration);
    }

    // ============================================================
    // STEP 9: Build ES-compatible video objects
    // ============================================================

    const videos = rawVideos.map(entry => {

      const item = entry.item;
      const snippet = item.snippet || {};

      const videoId =
        item.contentDetails?.videoId ||
        snippet.resourceId?.videoId ||
        "";

      const registrySource =
        sourceMap[entry.channelId];

      return {

        source:
          registrySource?.name ||
          snippet.videoOwnerChannelTitle ||
          entry.youtubeChannelTitle ||
          "",

        type:
          registrySource?.type ||
          "youtube",

        handle:
          registrySource?.handle ||
          "",

        channelId:
          entry.channelId,

        title:
          snippet.title || "",

        description:
          snippet.description || "",

        published:
          item.contentDetails?.videoPublishedAt ||
          snippet.publishedAt ||
          "",

        videoId:
          videoId,

        thumbnail:
          snippet.thumbnails?.maxres?.url ||
          snippet.thumbnails?.standard?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url ||
          "",

        duration:
          durationMap[videoId] || "",

        url:
          videoId
            ? "https://www.youtube.com/watch?v=" + videoId
            : "",

        rss:
          registrySource?.rss || ""
      };
    });

    // ============================================================
    // STEP 10: Sort newest first within this batch
    // ============================================================

    videos.sort((a, b) =>
      new Date(b.published) -
      new Date(a.published)
    );

    // ============================================================
    // FINAL RESULT
    // ============================================================

    const result = jsonResponse({

      success: true,

      registrySourceCount:
        sources.length,

      youtubeSourceCount:
        selectedSources.length,

      totalYoutubeSourceCount:
        youtubeSources.length,

      batch,
      totalBatches,

      returnedChannelCount:
        channelsData.items?.length || 0,

      videoCount:
        videos.length,

      videos:
        videos

    }, 200, {
      "Cache-Control": "public, max-age=1800"
    });

    await cache.put(cacheKey, result.clone());

    return result;

  } catch (error) {

    return jsonResponse({
      success: false,
      error: "82 Source Batch Test failed.",
      detail: error.message
    }, 500);
  }
}


// ================================================================
// HELPERS
// ================================================================

function jsonResponse(data, status = 200, extraHeaders = {}) {

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders
      }
    }
  );
}


function chunkArray(array, size) {

  const chunks = [];

  for (
    let i = 0;
    i < array.length;
    i += size
  ) {
    chunks.push(
      array.slice(i, i + size)
    );
  }

  return chunks;
}


function formatDuration(isoDuration) {

  if (!isoDuration) return "";

  const match = isoDuration.match(
    /P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
  );

  if (!match) {
    return isoDuration;
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0) + (days * 24);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);

  const parts = [];

  if (hours) {
    parts.push(hours + "h");
  }

  if (minutes) {
    parts.push(minutes + "m");
  }

  if (seconds || parts.length === 0) {
    parts.push(seconds + "s");
  }

  return parts.join(" ");
}
