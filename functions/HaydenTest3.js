export async function onRequestGet(context) {

  const apiKey = context.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "YOUTUBE_API_KEY is not available."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

  // Five video IDs returned by HaydenTest2
  const videoIds = [
    "K_2su2YqTgg",
    "EyFm9F7-SW0",
    "RNGDnsg1qkU",
    "0pGAPjEHKc4",
    "LUTOc795muU"
  ];

  const url =
    "https://www.googleapis.com/youtube/v3/videos" +
    "?part=contentDetails" +
    "&id=" + encodeURIComponent(videoIds.join(",")) +
    "&key=" + encodeURIComponent(apiKey);

  try {

    const response = await fetch(url);
    const data = await response.json();

    return new Response(
      JSON.stringify(data, null, 2),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        error: "YouTube API request failed."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
