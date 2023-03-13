type Stats = {
  registration: string;
  activities: Element[];
  registrationShort: string;
  activitiesShort: string[];
  shouldShowLongVersion?: boolean
};
type StatsProperty = {
  stats: Stats | Promise<void>;
};
type DouComment = HTMLElement;

const YEAR = new Date().getFullYear();
const SELECTORS = {
  comment: ".comment",
  author: ".b-post-author > a",
  text: ".comment_text",
};
const STORAGE_KEY = "__dou_black_list__";
const HIDDEN_COMMENT = `<div class="_banned">
  <div class="b-post-author">
    <a class="avatar">
      <img
        class="g-avatar"
        alt="avatar"
        src="https://s.dou.ua/img/avatars/80x80_966.png"
        width="25"
        height="25"
      />
      Banned user
    </a>
  </div>

  <div class="comment_text b-typo">Hidden content, click to show</div>
</div>
`;
const getTextElement = (comment: DouComment) =>
  comment.querySelectorAll(SELECTORS.text)[0] as HTMLElement;
const getText = (comment: DouComment) => getTextElement(comment).innerText;
const getAuthorElement = (comment: DouComment) =>
  comment.querySelectorAll(SELECTORS.author)[0] as HTMLAnchorElement;
const getAuthor = (comment: DouComment) => {
  return getAuthorElement(comment)?.href?.match(/users\/(.+)\//)?.[1];
};

const getStorage = (): Record<string, boolean> =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
const getUrl = (username) => `https://dou.ua/users/${username}/activities/`;

(() => {
  let inProgressPromises = 0;
  const storage = getStorage();
  const index: Record<string, Array<DouComment> & StatsProperty> = {};
  const isCommentFromBanned = (comment: DouComment) =>
    !!storage[getAuthor(comment)];

  function updateStorage(key, value) {
    storage[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  }

  function addBanButtonAndInfo(comment: DouComment) {
    const author = getAuthorElement(comment);
    if (!getAuthor(comment)) {
      return;
    }
    const existingBanButton =
      author.parentElement.querySelectorAll("._ban_button")[0];
    if (existingBanButton) {
      author.parentElement.removeChild(existingBanButton);
    }
    const existingInfoblock =
      author.parentElement.querySelectorAll("._ban_infoblock")[0];
    if (existingInfoblock) {
      author.parentElement.removeChild(existingInfoblock);
    }
    const button = document.createElement("button");
    button.classList.add("_ban_button");
    button.innerText = isCommentFromBanned(comment) ? "😇" : "🤡";
    button.title = isCommentFromBanned(comment) ? "unban" : "ban";
    button.onclick = (e) => {
      e.stopPropagation();
      const authorName = getAuthor(comment);
      const yes = confirm(
        `${isCommentFromBanned(comment) ? "unban" : "ban"} ${authorName}?`
      );
      if (yes) {
        updateStorage(authorName, !storage[authorName]);
        const commentsByAuthor = index[authorName];
        commentsByAuthor.forEach((comment) => {
          addBanButtonAndInfo(comment);
          hideContentIfNeeded(comment);
        });
        console.log(`Updated ${commentsByAuthor.length} comments`);
      }
    };
    author.parentElement.appendChild(button);
    const stats = index[getAuthor(comment)].stats as Stats;
    if (!stats?.activitiesShort && !stats?.registrationShort) {
      return;
    }
    const infoBlock = document.createElement("span");
    let text = [];
    if (stats.shouldShowLongVersion) {
      infoBlock.innerHTML = stats.registration;
      stats.activities.forEach(c => infoBlock.appendChild(c));
    } else {
      if (stats.activitiesShort[0]) {
        text.push(`${stats.activitiesShort[0]} c.`);
      }
      if (stats.activitiesShort[1]) {
        text.push(`${stats.activitiesShort[1]} t.`);
      }
      text.push(`${stats.registrationShort} yo.`);
      infoBlock.innerText = text.join(" | ");
      infoBlock.onclick = (e) => {
        e.preventDefault();
        stats.shouldShowLongVersion = true;
        addBanButtonAndInfo(comment);
      }
    }
    infoBlock.className = "_ban_infoblock cpointer";
    infoBlock.title = "click";
    author.parentElement.appendChild(infoBlock);
  }

  function hideContentIfNeeded(comment: DouComment) {
    const text = getTextElement(comment);
    if (!text) {
      return;
    }
    if (isCommentFromBanned(comment)) {
      comment.setAttribute("data-banned", comment.innerHTML);
      comment.innerHTML = HIDDEN_COMMENT;
      comment.onclick = (e) => {
        e.stopPropagation();
        const content = comment.getAttribute("data-banned");
        if (content) {
          // unhide
          comment.removeAttribute("data-banned");
          comment.innerHTML = content;
          addBanButtonAndInfo(comment);
          comment.onclick = () => {};
        } else {
          // hide again
          comment.setAttribute("data-banned", comment.innerHTML);
          comment.innerHTML = HIDDEN_COMMENT;
        }
      };
    } else {
      // unban clicked
      const content = comment.getAttribute("data-banned");
      if (content) {
        comment.removeAttribute("data-banned");
        comment.innerHTML = content;
        addBanButtonAndInfo(comment);
        comment.onclick = () => {};
      }
    }
  }

  function indexOne(comment: DouComment) {
    const authorName = getAuthor(comment);
    if (!authorName) {
      return;
    }
    const text = getText(comment);
    if (!text) {
      return;
    }
    if (!index[authorName]) {
      index[authorName] = [] as typeof index[string];
    }
    index[authorName].push(comment);

    if (!index[authorName].stats) {
      index[authorName].stats = fetchStats(authorName);
    }
  }

  async function fetchStats(username): Promise<void> {
    if (inProgressPromises > 2) {
      setTimeout(() => fetchStats(username), 100);
      return Promise.resolve();
    }
    inProgressPromises++;
    const response = await fetch(getUrl(username));
    if (!response.ok) {
      return;
    }
    inProgressPromises--;
    const text = await response.text();
    const html = document.createElement("html");
    html.innerHTML = text;
    const registration = html
      .querySelectorAll<HTMLDivElement>(".status-info")[0]
      .innerText.replace(/\t/g, "")
      .trim()
      .split("\n")
      .slice(-1)[0];

    const registrationShort = (
      YEAR - parseInt(registration.replace(/[^\d]/g, "").slice(-4), 10)
    ).toString(10);

    const activities = (
      [
        ...html.querySelectorAll(".b-content-menu")[0].childNodes,
      ] as HTMLLIElement[]
    )
      .filter((e) => e.innerText)
      .slice(1, 3)
      .map((e) => e.children[0]);
    const activitiesShort = activities
      .map((e) => e.querySelector("sub")?.innerText)
      .filter((_) => _);
    index[username].stats = {
      registration,
      registrationShort,
      activities,
      activitiesShort,
    };
    index[username].forEach(addBanButtonAndInfo);
  }

  console.time(STORAGE_KEY);
  [...document.querySelectorAll(SELECTORS.comment)].forEach(
    (comment: DouComment) => {
      indexOne(comment);
      addBanButtonAndInfo(comment);
      hideContentIfNeeded(comment);
    }
  );
  // @ts-ignore
  window.__dou_black_list__ = index;
  console.timeEnd(STORAGE_KEY);
})();
