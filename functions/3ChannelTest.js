export async function onRequestGet(context) {

  const apiKey = context.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "YOUTUBE_API_KEY is not available."
    }, 500);
  }

  // ============================================================
  // THREE TEST CHANNELS
  // ============================================================

  const channelIds = [
    "UCwJySRiyFIE2w99_bHvfmRA",
    "UCh1W-CtmEfxf0bS_aChaKlw",
    "UC-3WFOCWkUFQcX_1W3NjqAQ"
  ];

  try {

    // ============================================================
    // STEP 1:
    // Get channel information + uploads playlist IDs
    // All three channels in ONE API request
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

    if (!channelsData.items?.length) {
      return jsonResponse({
        success: false,
        error: "No YouTube channels were returned."
      }, 404);
    }


    // ============================================================
    // STEP 2:
    // For each channel, retrieve its five newest uploads
    // ============================================================

    const playlistRequests = channelsData.items.map(async channel => {

      const uploadsPlaylistId =
        channel.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return [];
      }

      const playlistUrl =
        "https://www.googleapis.com/youtube/v3/playlistItems" +
        "?part=snippet,contentDetails" +
        "&playlistId=" + encodeURIComponent(uploadsPlaylistId) +
        "&maxResults=5" +
        "&key=" + encodeURIComponent(apiKey);

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
        channelTitle:
          channel.snippet?.title ||
          item.snippet?.videoOwnerChannelTitle ||
          item.snippet?.channelTitle ||
          "",
        uploadsPlaylistId: uploadsPlaylistId,
        item: item
      }));
    });

    const playlistResults =
      await Promise.all(playlistRequests);

    const rawVideos =
      playlistResults.flat();


    // ============================================================
    // STEP 3:
    // Collect all video IDs from all three channels
    // ============================================================

    const videoIds = rawVideos
      .map(entry => entry.item.contentDetails?.videoId)
      .filter(Boolean);


    if (!videoIds.length) {
      return jsonResponse({
        success: true,
        channelCount: channelsData.items.length,
        videoCount: 0,
        videos: []
      });
    }


    // ============================================================
    // STEP 4:
    // Retrieve duration information for ALL videos
    // in ONE videos API request
    // ============================================================

    const videosUrl =
      "https://www.googleapis.com/youtube/v3/videos" +
      "?part=contentDetails" +
      "&id=" + encodeURIComponent(videoIds.join(",")) +
      "&key=" + encodeURIComponent(apiKey);

    const videosResponse = await fetch(videosUrl);
    const videosData = await videosResponse.json();

    if (!videosResponse.ok) {
      return jsonResponse({
        success: false,
        error: "Could not retrieve video details.",
        youtube: videosData
      }, videosResponse.status);
    }


    // ============================================================
    // STEP 5:
    // Create Video ID -> duration lookup
    // ============================================================

    const durationMap = {};

    for (const video of videosData.items || []) {
      durationMap[video.id] =
        formatDuration(video.contentDetails?.duration);
    }


    // ============================================================
    // STEP 6:
    // Normalize every video into ES-ready data
    // ============================================================

    const videos = rawVideos.map(entry => {

      const item = entry.item;
      const snippet = item.snippet || {};
      const videoId =
        item.contentDetails?.videoId ||
        snippet.resourceId?.videoId ||
        "";

      return {

        source:
          snippet.videoOwnerChannelTitle ||
          entry.channelTitle ||
          snippet.channelTitle ||
          "",

        type: "youtube",

        channelId: entry.channelId,

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
            : ""
      };
    });


    // ============================================================
    // STEP 7:
    // Merge all channels into ONE chronological feed
    // Newest first
    // ============================================================

    videos.sort((a, b) => {
      return new Date(b.published) - new Date(a.published);
    });


    // ============================================================
    // FINAL RESULT
    // ============================================================

    return jsonResponse({
      success: true,

      requestedChannelCount:
        channelIds.length,

      returnedChannelCount:
        channelsData.items.length,

      videoCount:
        videos.length,

      videos:
        videos
    });

  } catch (error) {

    return jsonResponse({
      success: false,
      error: "3 Channel Test failed.",
      detail: error.message
    }, 500);
  }
}


// ================================================================
// HELPERS
// ================================================================

function jsonResponse(data, status = 200) {

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}


function formatDuration(isoDuration) {

  if (!isoDuration) return "";

  const match =
    isoDuration.match(
      /P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/
    );

  if (!match) return isoDuration;

  const days = Number(match[1] || 0);
  const hours =
    Number(match[2] || 0) + (days * 24);

  const minutes =
    Number(match[3] || 0);

  const seconds =
    Number(match[4] || 0);

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
