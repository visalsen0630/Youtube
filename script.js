// ===== State =====
const state = {
  apiKey: localStorage.getItem("yt_api_key") || "",
  player: null,
  ytApiReady: false,
  currentVideo: null,
  queue: [],
  queueIndex: -1,
  relatedQueue: [],
  liked: JSON.parse(localStorage.getItem("yt_liked") || "[]"),
  commentsNextPage: null,
  commentSort: "relevance",
};

// ===== DOM =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  searchInput: $("#search-input"),
  searchBtn: $("#search-btn"),
  trendingGrid: $("#trending-grid"),
  searchResults: $("#search-results"),
  searchTitle: $("#search-title"),
  homePage: $("#home-page"),
  searchPage: $("#search-page"),
  watchPage: $("#watch-page"),
  categoryChips: $("#category-chips"),
  playlistList: $("#playlist-list"),
  // Watch page elements
  watchTitle: $("#watch-title"),
  watchChannel: $("#watch-channel"),
  watchAvatar: $("#watch-avatar"),
  watchStats: $("#watch-stats"),
  watchDescription: $("#watch-description"),
  watchLikeBtn: $("#watch-like-btn"),
  relatedVideos: $("#related-videos"),
  logoHome: $("#logo-home"),
  likeCount: $("#like-count"),
  commentsList: $("#comments-list"),
  commentsCount: $("#comments-count"),
  loadMoreComments: $("#load-more-comments"),
};

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  if (!state.apiKey) {
    showApiKeyModal();
  } else {
    init();
  }
});

// Load YouTube IFrame API
(function loadYTApi() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

// Called automatically by YouTube IFrame API when ready
function onYouTubeIframeAPIReady() {
  state.ytApiReady = true;
}

function init() {
  loadTrending();
  setupEventListeners();
  renderSavedPlaylist();
}

// ===== API Key Modal =====
function showApiKeyModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <h2>Welcome to Mini YouTube</h2>
      <p>Enter your YouTube Data API v3 key to get started.<br/>
         Get one free from the
         <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#3ea6ff">Google Cloud Console</a>
         — enable "YouTube Data API v3".</p>
      <input type="text" id="api-key-input" placeholder="Paste your API key here..." />
      <button id="api-key-submit">Get Started</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = $("#api-key-input");
  const submit = $("#api-key-submit");

  submit.addEventListener("click", () => {
    const key = input.value.trim();
    if (!key) return;
    state.apiKey = key;
    localStorage.setItem("yt_api_key", key);
    overlay.remove();
    init();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit.click();
  });
}

// ===== API Helpers =====
async function ytFetch(endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.searchParams.set("key", state.apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("YouTube API error:", err);
    throw new Error(err.error?.message || "API request failed");
  }
  return res.json();
}

// ===== Fetch Videos =====
async function getTrending(maxResults = 50) {
  const data = await ytFetch("videos", {
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode: "US",
    maxResults,
  });
  return data.items.map(mapVideoItem);
}

async function searchVideos(query, maxResults = 50) {
  const searchData = await ytFetch("search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults,
    order: "date",
  });

  const ids = searchData.items.map((item) => item.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const detailData = await ytFetch("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
  });

  return detailData.items.map(mapVideoItem);
}

async function getRelatedVideos(videoId, maxResults = 25) {
  // Use search with relatedToVideoId
  try {
    const searchData = await ytFetch("search", {
      part: "snippet",
      type: "video",
      relatedToVideoId: videoId,
      maxResults,
    });

    const ids = searchData.items
      .map((item) => item.id.videoId)
      .filter(Boolean);
    if (ids.length === 0) return [];

    const detailData = await ytFetch("videos", {
      part: "snippet,statistics,contentDetails",
      id: ids.join(","),
    });

    return detailData.items.map(mapVideoItem);
  } catch (e) {
    // Fallback: search by video title keywords
    console.warn("Related videos failed, using fallback search:", e);
    if (state.currentVideo) {
      const words = state.currentVideo.title.split(" ").slice(0, 3).join(" ");
      return searchVideos(words, maxResults);
    }
    return [];
  }
}

function mapVideoItem(item) {
  const snippet = item.snippet;
  const stats = item.statistics || {};
  const duration = item.contentDetails
    ? parseDuration(item.contentDetails.duration)
    : "";

  return {
    id: typeof item.id === "string" ? item.id : item.id.videoId,
    title: decodeHtml(snippet.title),
    channel: snippet.channelTitle,
    channelId: snippet.channelId,
    description: snippet.description || "",
    thumbnail:
      snippet.thumbnails.maxres?.url ||
      snippet.thumbnails.high?.url ||
      snippet.thumbnails.medium?.url ||
      snippet.thumbnails.default?.url,
    publishedAt: snippet.publishedAt,
    viewCount: stats.viewCount || "0",
    likeCount: stats.likeCount || "0",
    commentCount: stats.commentCount || "0",
    duration,
  };
}

// ===== Helpers =====
function decodeHtml(html) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(count) {
  const n = parseInt(count);
  if (isNaN(n)) return "0 views";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function formatNumber(count) {
  const n = parseInt(count);
  if (isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ===== Load Content =====
async function loadTrending() {
  showSkeletons(dom.trendingGrid, 12);
  try {
    const videos = await getTrending(50);
    renderVideoGrid(dom.trendingGrid, videos);
  } catch (e) {
    dom.trendingGrid.innerHTML = `<p class="empty-text">Failed to load videos. Check your API key.</p>`;
    console.error(e);
  }
}

function showSkeletons(container, count) {
  container.innerHTML = Array(count)
    .fill(
      `<div class="skeleton-card">
        <div class="skeleton-thumb"></div>
        <div class="skeleton-body">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-lines">
            <div class="skeleton-line"></div>
            <div class="skeleton-line"></div>
          </div>
        </div>
      </div>`
    )
    .join("");
}

// ===== Render Video Grid =====
function renderVideoGrid(container, videos) {
  container.innerHTML = "";
  videos.forEach((video, idx) => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.innerHTML = `
      <div class="card-thumbnail">
        <img src="${video.thumbnail}" alt="${escapeAttr(video.title)}" loading="lazy" />
        ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ""}
      </div>
      <div class="card-body">
        <div class="card-avatar">${video.channel.charAt(0).toUpperCase()}</div>
        <div class="card-meta">
          <div class="card-title">${escapeHtml(video.title)}</div>
          <div class="card-channel">${escapeHtml(video.channel)}</div>
          <div class="card-stats">
            <span>${formatViews(video.viewCount)}</span>
            <span>${timeAgo(video.publishedAt)}</span>
          </div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      state.queue = videos;
      state.queueIndex = idx;
      openWatchPage(video);
    });
    container.appendChild(card);
  });
}

// ===== Watch Page (Video Player) =====
function openWatchPage(video, skipHistory = false) {
  state.currentVideo = video;

  // Push browser history so back button works
  if (!skipHistory) {
    history.pushState({ page: "watch", videoId: video.id }, "", "#watch=" + video.id);
  }

  // Show watch page, hide others
  showPage("watch");

  // Scroll to top
  document.querySelector(".content-area").scrollTop = 0;

  // Destroy previous player if exists
  if (state.player && state.player.destroy) {
    try { state.player.destroy(); } catch (e) {}
    state.player = null;
  }

  // Create player using YouTube IFrame API (supports background playback)
  const playerContainer = $("#yt-player");
  playerContainer.innerHTML = '<div id="yt-player-inner"></div>';

  if (state.ytApiReady) {
    createYTPlayer(video.id);
  } else {
    // Fallback: wait for API or use iframe
    const checkReady = setInterval(() => {
      if (state.ytApiReady) {
        clearInterval(checkReady);
        createYTPlayer(video.id);
      }
    }, 100);
    // Timeout after 5s - fallback to plain iframe
    setTimeout(() => {
      clearInterval(checkReady);
      if (!state.player) {
        playerContainer.innerHTML = `
          <iframe
            src="https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1&mute=1"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        `;
      }
    }, 5000);
  }

  // Fill video info
  dom.watchTitle.textContent = video.title;
  dom.watchChannel.textContent = video.channel;
  dom.watchAvatar.textContent = video.channel.charAt(0).toUpperCase();

  // Like count
  dom.likeCount.textContent = formatNumber(video.likeCount);

  // Description with stats
  const descText = video.description
    ? video.description.substring(0, 300) + (video.description.length > 300 ? "..." : "")
    : "";
  dom.watchDescription.innerHTML = `
    <div class="watch-stats">${formatViews(video.viewCount)}  •  ${timeAgo(video.publishedAt)}</div>
    ${escapeHtml(descText)}
  `;

  // Comments count header
  dom.commentsCount.textContent = `${formatNumber(video.commentCount)} Comments`;

  // Update save button
  updateWatchLikeButton();

  // Update page title
  document.title = `${video.title} — Mini YouTube`;

  // Update Media Session metadata
  updateMediaSession(video);

  // Load related videos + comments
  loadRelatedVideos(video.id);
  state.commentSort = "relevance";
  $$(".sort-btn").forEach((b) => b.classList.toggle("active", b.dataset.sort === "relevance"));
  loadComments(video.id);
}

function createYTPlayer(videoId) {
  state.player = new YT.Player("yt-player-inner", {
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      rel: 0,
      playsinline: 1,
      enablejsapi: 1,
      mute: 1, // Mute initially to allow mobile autoplay
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady(event) {
  // Start playing (needed for mobile)
  event.target.playVideo();
  // Unmute after a short delay once playback has started
  setTimeout(() => {
    if (state.player && state.player.unMute) {
      state.player.unMute();
      state.player.setVolume(100);
    }
  }, 500);
}

function onPlayerStateChange(event) {
  // Update Media Session playback state
  if ("mediaSession" in navigator) {
    if (event.data === YT.PlayerState.PLAYING) {
      navigator.mediaSession.playbackState = "playing";
    } else if (event.data === YT.PlayerState.PAUSED) {
      navigator.mediaSession.playbackState = "paused";
    }
  }

  // Auto-play next video in queue when current one ends
  if (event.data === YT.PlayerState.ENDED) {
    playNext();
  }
}

function playNext() {
  if (state.queue.length > 0 && state.queueIndex < state.queue.length - 1) {
    state.queueIndex++;
    openWatchPage(state.queue[state.queueIndex]);
  } else if (state.relatedQueue && state.relatedQueue.length > 0) {
    // When the current queue ends, continue with related videos
    const nextVideo = state.relatedQueue[0];
    state.queue = state.relatedQueue;
    state.queueIndex = 0;
    openWatchPage(nextVideo);
  }
}

function playPrev() {
  if (state.queue.length > 0 && state.queueIndex > 0) {
    state.queueIndex--;
    openWatchPage(state.queue[state.queueIndex]);
  }
}

async function loadRelatedVideos(videoId) {
  dom.relatedVideos.innerHTML = Array(8)
    .fill(
      `<div class="related-card" style="opacity:0.4">
        <div class="related-thumb" style="background:#222"></div>
        <div class="related-info">
          <div class="skeleton-line" style="width:80%;height:10px;background:#222;border-radius:4px;margin-bottom:6px"></div>
          <div class="skeleton-line" style="width:50%;height:10px;background:#222;border-radius:4px"></div>
        </div>
      </div>`
    )
    .join("");

  try {
    const videos = await getRelatedVideos(videoId, 25);
    state.relatedQueue = videos;
    renderRelatedVideos(videos);
  } catch (e) {
    state.relatedQueue = [];
    dom.relatedVideos.innerHTML = '<p class="empty-text">Could not load related videos.</p>';
    console.error(e);
  }
}

function renderRelatedVideos(videos) {
  dom.relatedVideos.innerHTML = "";
  videos.forEach((video, idx) => {
    const card = document.createElement("div");
    card.className = "related-card";
    card.innerHTML = `
      <div class="related-thumb">
        <img src="${video.thumbnail}" alt="${escapeAttr(video.title)}" loading="lazy" />
        ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ""}
      </div>
      <div class="related-info">
        <div class="card-title">${escapeHtml(video.title)}</div>
        <div class="card-channel">${escapeHtml(video.channel)}</div>
        <div class="card-stats">
          <span>${formatViews(video.viewCount)}</span>
          <span>${timeAgo(video.publishedAt)}</span>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      state.queue = videos;
      state.queueIndex = idx;
      openWatchPage(video);
    });
    dom.relatedVideos.appendChild(card);
  });
}

// ===== Comments =====
async function fetchComments(videoId, order = "relevance", pageToken = null) {
  const params = {
    part: "snippet",
    videoId,
    maxResults: 20,
    order,
    textFormat: "plainText",
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await ytFetch("commentThreads", params);
  return data;
}

async function loadComments(videoId, append = false) {
  if (!append) {
    dom.commentsList.innerHTML = '<p class="empty-text">Loading comments...</p>';
    state.commentsNextPage = null;
  }

  try {
    const data = await fetchComments(
      videoId,
      state.commentSort,
      append ? state.commentsNextPage : null
    );

    state.commentsNextPage = data.nextPageToken || null;
    dom.loadMoreComments.classList.toggle("hidden", !state.commentsNextPage);

    const comments = data.items.map((item) => {
      const c = item.snippet.topLevelComment.snippet;
      return {
        author: c.authorDisplayName,
        authorImage: c.authorProfileImageUrl,
        text: c.textDisplay,
        likeCount: c.likeCount || 0,
        publishedAt: c.publishedAt,
        replyCount: item.snippet.totalReplyCount || 0,
      };
    });

    if (!append) dom.commentsList.innerHTML = "";

    comments.forEach((comment) => {
      const el = document.createElement("div");
      el.className = "comment-item";
      el.innerHTML = `
        <img class="comment-avatar" src="${comment.authorImage}" alt="" />
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(comment.author)}</span>
            <span class="comment-time">${timeAgo(comment.publishedAt)}</span>
          </div>
          <p class="comment-text">${escapeHtml(comment.text)}</p>
          <div class="comment-footer">
            <button class="comment-action">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
              <span>${comment.likeCount > 0 ? formatNumber(comment.likeCount) : ""}</span>
            </button>
            <button class="comment-action">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
            </button>
            ${comment.replyCount > 0 ? `<button class="comment-reply-count">${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"}</button>` : ""}
          </div>
        </div>
      `;
      dom.commentsList.appendChild(el);
    });

    if (!append && comments.length === 0) {
      dom.commentsList.innerHTML = '<p class="empty-text">Comments are turned off.</p>';
    }
  } catch (e) {
    if (!append) {
      dom.commentsList.innerHTML = '<p class="empty-text">Comments are turned off for this video.</p>';
    }
    dom.loadMoreComments.classList.add("hidden");
    console.error("Comments error:", e);
  }
}

// ===== Like / Save =====
function toggleLike() {
  if (!state.currentVideo) return;
  const idx = state.liked.findIndex((v) => v.id === state.currentVideo.id);
  if (idx >= 0) {
    state.liked.splice(idx, 1);
  } else {
    state.liked.push({ ...state.currentVideo });
  }
  localStorage.setItem("yt_liked", JSON.stringify(state.liked));
  updateWatchLikeButton();
  renderSavedPlaylist();
}

function updateWatchLikeButton() {
  if (!state.currentVideo) return;
  const isLiked = state.liked.some((v) => v.id === state.currentVideo.id);
  dom.watchLikeBtn.classList.toggle("liked", isLiked);

  const svgEl = dom.watchLikeBtn.querySelector("svg");
  if (isLiked) {
    svgEl.innerHTML =
      '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>';
    dom.watchLikeBtn.querySelector("span").textContent = "Saved";
  } else {
    svgEl.innerHTML =
      '<path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/>';
    dom.watchLikeBtn.querySelector("span").textContent = "Save";
  }
}

function renderSavedPlaylist() {
  if (state.liked.length === 0) {
    dom.playlistList.innerHTML =
      '<p class="empty-text">Saved videos will appear here</p>';
    return;
  }
  dom.playlistList.innerHTML = "";
  state.liked.forEach((video, idx) => {
    const item = document.createElement("div");
    item.className = "playlist-item";
    item.innerHTML = `
      <img src="${video.thumbnail}" alt="${escapeAttr(video.title)}" />
      <div class="playlist-item-text">
        <div class="playlist-item-title">${escapeHtml(video.title)}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      state.queue = [...state.liked];
      state.queueIndex = idx;
      openWatchPage(video);
    });
    dom.playlistList.appendChild(item);
  });
}

// ===== Navigation =====
function showPage(page) {
  dom.homePage.classList.toggle("hidden", page !== "home");
  dom.searchPage.classList.toggle("hidden", page !== "search");
  dom.watchPage.classList.toggle("hidden", page !== "watch");

  // Toggle body class for mobile watch page styling
  document.body.classList.toggle("watching", page === "watch");

  // Show/hide chips on browse pages only
  dom.categoryChips.classList.toggle("hidden", page === "watch");

  // Stop video and reset comments when leaving watch page
  if (page !== "watch") {
    if (state.player && state.player.destroy) {
      try { state.player.destroy(); } catch (e) {}
      state.player = null;
    }
    const playerContainer = $("#yt-player");
    playerContainer.innerHTML = "";
    dom.commentsList.innerHTML = "";
    dom.loadMoreComments.classList.add("hidden");
    state.commentsNextPage = null;
    document.title = "Mini YouTube";
  }
}

function goHome(pushState = true) {
  showPage("home");
  dom.searchInput.value = "";
  $$(".chip").forEach((c) => c.classList.remove("active"));
  $(".chip").classList.add("active");
  $$(".nav-item").forEach((n) => n.classList.remove("active"));
  $('[data-page="home"]').classList.add("active");
  // Update bottom nav
  $$(".bottom-nav-item").forEach((n) => n.classList.remove("active"));
  const homeBtn = $(".bottom-nav-item[data-page='home']");
  if (homeBtn) homeBtn.classList.add("active");
  if (pushState) {
    history.pushState({ page: "home" }, "", "#home");
  }
}

function goBack() {
  // Use browser history to go back
  history.back();
}

// ===== Search =====
async function performSearch(query, pushState = true) {
  if (!query.trim()) return;
  showPage("search");
  dom.searchTitle.textContent = `Results for "${query}"`;
  if (pushState) {
    history.pushState({ page: "search", query }, "", "#search=" + encodeURIComponent(query));
  }
  showSkeletons(dom.searchResults, 12);
  try {
    const videos = await searchVideos(query);
    renderVideoGrid(dom.searchResults, videos);
  } catch (e) {
    dom.searchResults.innerHTML =
      '<p class="empty-text">Search failed. Check your API key.</p>';
    console.error(e);
  }
}

// ===== Event Listeners =====
function setupEventListeners() {
  // Logo → go home
  dom.logoHome.addEventListener("click", goHome);

  // Watch page back button
  const watchBackBtn = $("#watch-back-btn");
  if (watchBackBtn) {
    watchBackBtn.addEventListener("click", goBack);
  }

  // Watch page like button
  dom.watchLikeBtn.addEventListener("click", toggleLike);

  // Load more comments
  dom.loadMoreComments.addEventListener("click", () => {
    if (state.currentVideo && state.commentsNextPage) {
      loadComments(state.currentVideo.id, true);
    }
  });

  // Comment sort buttons
  $$(".sort-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".sort-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.commentSort = btn.dataset.sort;
      if (state.currentVideo) {
        loadComments(state.currentVideo.id, false);
      }
    });
  });

  // Search on Enter or button click
  dom.searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") performSearch(dom.searchInput.value);
  });
  dom.searchBtn.addEventListener("click", () => {
    performSearch(dom.searchInput.value);
  });

  // Category chips
  dom.categoryChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");

    const query = chip.dataset.query;
    if (!query) {
      showPage("home");
      dom.searchInput.value = "";
    } else {
      dom.searchInput.value = query;
      performSearch(query);
    }
  });

  // Sidebar navigation
  $$(".nav-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".nav-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");

      navigateToPage(el.dataset.page);
    });
  });

  // ===== Mobile: Bottom Navigation =====
  $$(".bottom-nav-item").forEach((el) => {
    el.addEventListener("click", () => {
      $$(".bottom-nav-item").forEach((n) => n.classList.remove("active"));
      el.classList.add("active");

      navigateToPage(el.dataset.page);
    });
  });

  // ===== Mobile: Logo → Home =====
  const mobileLogoHome = $("#mobile-logo-home");
  if (mobileLogoHome) {
    mobileLogoHome.addEventListener("click", goHome);
  }

  // ===== Mobile: Search Toggle =====
  const mobileSearchToggle = $("#mobile-search-toggle");
  const mobileSearchBar = $("#mobile-search-bar");
  const mobileSearchBack = $("#mobile-search-back");
  const mobileSearchInput = $("#mobile-search-input");

  if (mobileSearchToggle && mobileSearchBar) {
    mobileSearchToggle.addEventListener("click", () => {
      mobileSearchBar.classList.remove("hidden");
      document.body.classList.add("mobile-search-active");
      mobileSearchInput.focus();
    });

    mobileSearchBack.addEventListener("click", () => {
      mobileSearchBar.classList.add("hidden");
      document.body.classList.remove("mobile-search-active");
      mobileSearchInput.value = "";
    });

    mobileSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = mobileSearchInput.value.trim();
        if (query) {
          performSearch(query);
          mobileSearchBar.classList.add("hidden");
          document.body.classList.remove("mobile-search-active");
        }
      }
    });
  }
}

// ===== Shared Navigation Logic =====
function navigateToPage(page, pushState = true) {
  if (page === "home") {
    goHome(pushState);
  } else if (page === "trending") {
    showPage("home");
    loadTrending();
    if (pushState) {
      history.pushState({ page: "trending" }, "", "#trending");
    }
  } else if (page === "library") {
    showLibrary();
    if (pushState) {
      history.pushState({ page: "library" }, "", "#library");
    }
  }
}

function showLibrary() {
  showPage("search");
  dom.searchTitle.textContent = "Saved Videos";
  dom.searchResults.innerHTML = "";
  if (state.liked.length > 0) {
    renderVideoGrid(dom.searchResults, state.liked);
  } else {
    dom.searchResults.innerHTML =
      '<p class="empty-text">No saved videos yet. Click the Save button while watching to save videos.</p>';
  }
}

// ===== Media Session API (Lock Screen / Notification Controls) =====
function updateMediaSession(video) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: video.title,
    artist: video.channel,
    album: "Mini YouTube",
    artwork: [
      { src: video.thumbnail, sizes: "480x360", type: "image/jpeg" },
    ],
  });

  navigator.mediaSession.setActionHandler("play", () => {
    if (state.player && state.player.playVideo) {
      state.player.playVideo();
    }
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    if (state.player && state.player.pauseVideo) {
      state.player.pauseVideo();
    }
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    playPrev();
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    playNext();
  });

  navigator.mediaSession.playbackState = "playing";
}

// ===== Background Playback Support =====
// Keep audio alive when tab goes to background on mobile
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.player && state.player.getPlayerState) {
    // If the player was playing when we went to background, keep it playing
    const playerState = state.player.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
      // Player should continue in background with IFrame API
      // Set a check to resume if it gets paused by the browser
      state._bgInterval = setInterval(() => {
        if (state.player && state.player.getPlayerState) {
          const s = state.player.getPlayerState();
          if (s === YT.PlayerState.PAUSED) {
            state.player.playVideo();
          }
        }
      }, 1000);
    }
  } else {
    // Tab is visible again, clear the background interval
    if (state._bgInterval) {
      clearInterval(state._bgInterval);
      state._bgInterval = null;
    }
  }
});

// ===== Browser History (Back/Forward Button) =====
window.addEventListener("popstate", (e) => {
  const s = e.state;
  if (!s) {
    // No state — go home
    goHome(false);
    return;
  }

  if (s.page === "home") {
    goHome(false);
  } else if (s.page === "trending") {
    navigateToPage("trending", false);
  } else if (s.page === "library") {
    navigateToPage("library", false);
  } else if (s.page === "search" && s.query) {
    performSearch(s.query, false);
  } else if (s.page === "watch" && s.videoId) {
    // Re-fetch video details and open
    ytFetch("videos", {
      part: "snippet,statistics,contentDetails",
      id: s.videoId,
    }).then((data) => {
      if (data.items && data.items.length > 0) {
        const video = mapVideoItem(data.items[0]);
        state.currentVideo = video;
        showPage("watch");
        document.querySelector(".content-area").scrollTop = 0;
        // Destroy previous player
        if (state.player && state.player.destroy) {
          try { state.player.destroy(); } catch (e) {}
          state.player = null;
        }
        const playerContainer = $("#yt-player");
        playerContainer.innerHTML = '<div id="yt-player-inner"></div>';
        if (state.ytApiReady) {
          createYTPlayer(video.id);
        }
        dom.watchTitle.textContent = video.title;
        dom.watchChannel.textContent = video.channel;
        dom.watchAvatar.textContent = video.channel.charAt(0).toUpperCase();
        dom.likeCount.textContent = formatNumber(video.likeCount);
        const descText = video.description
          ? video.description.substring(0, 300) + (video.description.length > 300 ? "..." : "")
          : "";
        dom.watchDescription.innerHTML = `
          <div class="watch-stats">${formatViews(video.viewCount)}  •  ${timeAgo(video.publishedAt)}</div>
          ${escapeHtml(descText)}
        `;
        dom.commentsCount.textContent = `${formatNumber(video.commentCount)} Comments`;
        updateWatchLikeButton();
        loadRelatedVideos(video.id);
        loadComments(video.id);
      }
    }).catch(() => {
      goHome(false);
    });
  }
});

// Set initial history state
history.replaceState({ page: "home" }, "", "#home");

// ===== Source Protection =====
(function () {
  // Disable right-click context menu
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Disable DevTools keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12") { e.preventDefault(); return; }
    // Ctrl+Shift+I (Inspect), Ctrl+Shift+J (Console), Ctrl+Shift+C (Element picker)
    if (e.ctrlKey && e.shiftKey && ["I","J","C"].includes(e.key.toUpperCase())) { e.preventDefault(); return; }
    // Ctrl+U (View Source)
    if (e.ctrlKey && e.key.toUpperCase() === "U") { e.preventDefault(); return; }
    // Ctrl+S (Save page)
    if (e.ctrlKey && e.key.toUpperCase() === "S") { e.preventDefault(); return; }
  });

  // Disable drag
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // DevTools detection via debugger trap
  (function _dt() {
    const t = new Date();
    debugger;
    if (new Date() - t > 100) {
      document.body.innerHTML = "";
    }
    setTimeout(_dt, 3000);
  })();

  // Console clear on open
  const _c = console.clear;
  Object.defineProperty(console, "_c", { get: function () { document.body.innerHTML = ""; } });
})();
