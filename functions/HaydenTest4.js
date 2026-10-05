export async function onRequestGet(context) {

  const apiKey = context.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "YOUTUBE_API_KEY is not available."
    }, 500);
  }

  // Our ONLY Hayden-specific input
  const channelId = "UCwJySRiyFIE2w99_bHvfmRA";

  try {

    // ============================================================
    // STEP 1: Channel ID -> Uploads Playlist ID
    // ============================================================

    const channelUrl =
      "https://www.googleapis.com/youtube/v3/channels" +
      "?part=contentDetails" +
      "&id=" + encodeURIComponent(channelId) +
      "&key=" + encodeURIComponent(apiKey);

    const channelResponse = await fetch(channelUrl);
    const channelData = await channelResponse.json();

    if (!channelResponse.ok || !channelData.items?.length) {
      return jsonResponse({
        success: false,
        error: "Could not retrieve YouTube channel."
      }, channelResponse.status || 500);
    }

    const uploadsPlaylistId =
      channelData.items[0].contentDetails.relatedPlaylists.uploads;


    // ============================================================
    // STEP 2: Uploads Playlist -> Five Recent Videos
    // ============================================================

    const playlistUrl =
      "https://www.googleapis.com/youtube/v3/playlistItems" +
      "?part=snippet,contentDetails" +
      "&playlistId=" + encodeURIComponent(uploadsPlaylistId) +
      "&maxResults=5" +
      "&key=" + encodeURIComponent(apiKey);

    const playlistResponse = await fetch(playlistUrl);
    const playlistData = await playlistResponse.json();

    if (!playlistResponse.ok || !playlistData.items?.length) {
      return jsonResponse({
        success: false,
        error: "Could not retrieve channel uploads."
      }, playlistResponse.status || 500);
    }


    // ============================================================
    // STEP 3: Collect Video IDs
    // ============================================================

    const videoIds = playlistData.items
      .map(item => item.contentDetails?.videoId)
      .filter(Boolean);


    // ============================================================
    // STEP 4: Video IDs -> Durations
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
        error: "Could not retrieve video details."
      }, videosResponse.status || 500);
    }


    // ============================================================
    // STEP 5: Match Durations to Video IDs
    // ============================================================

    const durationMap = {};

    for (const video of videosData.items || []) {
      durationMap[video.id] =
        formatDuration(video.contentDetails?.duration);
    }


    // ============================================================
    // STEP 6: Build Clean ES-Ready Objects
    // ============================================================

    const videos = playlistData.items.map(item => {

      const snippet = item.snippet;
      const videoId = item.contentDetails.videoId;

      return {
        source: snippet.videoOwnerChannelTitle ||
                snippet.channelTitle,

        type: "youtube",

        title: snippet.title,

        description: snippet.description || "",

        published:
          item.contentDetails.videoPublishedAt ||
          snippet.publishedAt,

        videoId: videoId,

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
          "https://www.youtube.com/watch?v=" + videoId
      };
    });


    // ============================================================
    // FINAL RESULT
    // ============================================================

    return jsonResponse({
      success: true,
      channelId: channelId,
      uploadsPlaylistId: uploadsPlaylistId,
      count: videos.length,
      videos: videos
    });

  } catch (error) {

    return jsonResponse({
      success: false,
      error: "Hayden Test 4 failed.",
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
