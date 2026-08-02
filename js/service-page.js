/* 事業紹介ページ共通スクリプト（スクロール演出・進捗バー・セクションドットナビ・カード傾き）
 * reskilling.html のインライン <script> から切り出したもの。出典は同上。
 */
// ===== B. staggered reveal on scroll (cleaned up after, so hover/tilt stay free) =====
document.querySelectorAll(".wrap.reveal").forEach((w) => w.classList.remove("reveal"));
// assign a varied entrance per element type (not all the same fade-up)
const reveal = (sel, variant) => document.querySelectorAll(sel).forEach((el) => {
  el.classList.add("reveal"); if (variant) el.classList.add(variant);
});
reveal(".eyebrow", "r-left");          // labels slide in from the left
reveal("h2.section-title", "r-clip");  // headings wipe left -> right
reveal(".statement", "r-blur");        // big quotes focus in from blur
reveal(".lead");                       // body copy: fade up
reveal(".note");
reveal(".final__p");
reveal(".calc", "r-scale");            // pop in
reveal(".price", "r-scale");
reveal("section .btn", "r-scale");
reveal(".specs__row", "r-left");       // table rows slide from the left
reveal(".final__h", "r-blur");
document.querySelectorAll(".card").forEach((c) => c.classList.add("reveal", "r-rise")); // cards rise up in 3D
// stagger items inside grids and the spec table
document.querySelectorAll(".grid").forEach((grid) => {
  [...grid.children].forEach((c, i) => { if (c.classList.contains("reveal")) c.style.animationDelay = (i * 0.1) + "s"; });
});
document.querySelectorAll(".specs").forEach((s) => {
  [...s.querySelectorAll(".specs__row")].forEach((r, i) => { r.style.animationDelay = (i * 0.08) + "s"; });
});
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      io.unobserve(e.target);
      e.target.addEventListener("animationend", () => e.target.classList.remove("reveal", "in"), { once: true });
    }
  });
}, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ===== E1. scroll progress bar =====
const prog = document.getElementById("progress");
const onScroll = () => {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  prog.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ===== E2. section dots nav =====
const dots = document.getElementById("dots");
const navTargets = [...document.querySelectorAll("[data-nav]")];
const dotMap = new Map();
navTargets.forEach((sec) => {
  const a = document.createElement("a");
  a.href = "#" + sec.id;
  a.innerHTML = '<span class="label">' + sec.dataset.nav + '</span><span class="dot"></span>';
  dots.appendChild(a);
  dotMap.set(sec, a);
});
const spy = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      dots.querySelectorAll("a").forEach((d) => d.classList.remove("active"));
      const a = dotMap.get(e.target); if (a) a.classList.add("active");
    }
  });
}, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
navTargets.forEach((s) => spy.observe(s));

// ===== F. card 3D tilt on hover =====
document.querySelectorAll(".card").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = "perspective(820px) rotateY(" + (px * 7) + "deg) rotateX(" + (-py * 7) + "deg) translateY(-6px)";
  });
  card.addEventListener("pointerleave", () => { card.style.transform = ""; });
});
