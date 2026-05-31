"use strict";

const shardbase = "messages/";
const manifesturl = "other/manifest.json";
const epoch = 1420070400000n;
const batch = 250;
const cachespan = 1;

let manifest = null;
let server = null;
let chan = null;
let st = null;

const twopts = {
    base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
    folder: "svg", ext: ".svg",
};
const defaultchan = {tenna: "bunny", antikervyn: "general"};

const svgchan = '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z" clip-rule="evenodd"></path></svg>';
const svgvc = '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z"></path><path fill="currentColor" d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z"></path></svg>';
const svgsearch = '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" fill-rule="evenodd" d="M15.62 17.03a9 9 0 1 1 1.41-1.41l4.68 4.67a1 1 0 0 1-1.42 1.42l-4.67-4.68ZM17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" clip-rule="evenodd"></path></svg>';
const svgclear = '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z"></path></svg>';

function chanicon(name) {
    return /\bvc\b/i.test(striphash(name)) ? svgvc : svgchan;
}

function localemoji(name, ext) {return "other/emojis/" + encodeURIComponent(name) + "." + (ext || "webp")}
function localsticker(name, ext) {return "other/stickers/" + encodeURIComponent(name) + "." + (ext || "png")}

const q = (sel) => document.querySelector(sel);
function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
}
function tw(node) {
    if (node && window.twemoji) twemoji.parse(node, twopts);
    return node;
}

/*//////////////////////////////////////////////////////////////////////*/

async function loadjson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch " + url + " -> " + res.status);
    const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
}
function shardpath(srv, cid, i) {
    return shardbase + srv + "/" + cid + "/p" + String(i).padStart(3, "0") + ".json.gz";
}
async function getshard(i) {
    if (st.cache[i]) return st.cache[i];
    const data = await loadjson(shardpath(st.srv, st.cid, i));
    Object.assign(st.authors, data.authors || {});
    st.cache[i] = data;
    evictshards();
    return data;
}
function evictshards() {
    const lo = st.top.s - cachespan, hi = st.bot.s + cachespan;
    for (const k of Object.keys(st.cache)) {
        const n = +k;
        if (n < lo || n > hi) delete st.cache[k];
    }
}

/*//////////////////////////////////////////////////////////////////////*/

function snowdate(id) {
    return new Date(Number((BigInt(id) >> 22n) + epoch));
}
const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const mon = ["January","February","March","April","May","June","July",
             "August","September","October","November","December"];
function fmttime(d) {
    let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + String(d.getMinutes()).padStart(2, "0") + " " + ap;
}
function fmtfull(d) {
    return dow[d.getDay()] + ", " + mon[d.getMonth()] + " " + d.getDate() +
           ", " + d.getFullYear() + " " + fmttime(d);
}
function fmtday(d) {
    return mon[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
}
function daykey(d) {
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
}

/*//////////////////////////////////////////////////////////////////////*/

function buildrail() {
    const rail = q(".rail");
    rail.innerHTML = "";
    manifest.servers.forEach((s) => {
        const d = el("div", "railicon");
        d.title = s.name;
        d.dataset.key = s.key;
        if (s.icon) d.appendChild(el("img")).src = s.icon;
        else d.textContent = (s.name || "?").slice(0, 2);
        d.onclick = () => selectserver(s);
        rail.appendChild(d);
    });
}
function selectserver(s) {
    server = s;
    document.querySelectorAll(".railicon").forEach((r) =>
        r.classList.toggle("active", r.dataset.key === s.key));
    tw(Object.assign(q(".guildname"), {textContent: s.name}));
    q(".search").placeholder = "Search " + s.name + "...";
    buildchannels();
    opendefault();
}
function visiblechans(cat) {
    return cat.channels.filter((c) => c.count);
}
function opendefault() {
    const want = defaultchan[server.key];
    let named = null, firstfull = null;
    for (const cat of server.categories) {
        for (const c of visiblechans(cat)) {
            if (want && !named && striphash(c.name).toLowerCase().includes(want)) named = c;
            if (!firstfull) firstfull = c;
        }
    }
    const pick = named || firstfull;
    if (pick) openchannel(pick);
}
function buildchannels() {
    const wrap = q(".channels");
    wrap.innerHTML = "";
    server.categories.forEach((cat) => {
        const chans = visiblechans(cat);
        if (!chans.length) return;
        const cdiv = el("div", "cat");
        const head = el("div", "catname", "&#9662; " + (esc(cleancat(cat.name)) || "channels"));
        const list = el("div", "catlist");
        head.onclick = () => cdiv.classList.toggle("collapsed");
        cdiv.appendChild(head);
        cdiv.appendChild(list);
        chans.forEach((c) => {
            const row = el("div", "chan");
            row.dataset.cid = c.id;
            row.innerHTML = '<span class=chanhash>' + chanicon(c.name) + '</span>' +
                '<span class=chanlabel>' + esc(striphash(c.name)) + '</span>' +
                '<span class=chancount>' + fmtcount(c.count) + '</span>';
            row.onclick = () => openchannel(c);
            list.appendChild(row);
        });
        wrap.appendChild(cdiv);
    });
}
function striphash(name) {
    return (name || "").replace(/^#/, "");
}
function cleancat(name) {
    return (name || "").replace(/[─⋆⋅-]/g, "").replace(/\s+/g, " ").trim();
}
function fmtcount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n;
}

/*//////////////////////////////////////////////////////////////////////*/

async function openchannel(c, jumpshard, jumpid) {
    chan = c;
    document.querySelectorAll(".chan").forEach((r) =>
        r.classList.toggle("active", r.dataset.cid === c.id));
    tw(Object.assign(q(".chantitle"), {innerHTML:
        '<span class=chanhash>' + chanicon(c.name) + '</span>' +
        esc(striphash(c.name)) + '<span class=chanid>' + esc(c.id) + '</span>'}));

    const box = q(".messages");
    box.onscroll = null;
    box.innerHTML = "";
    q(".olderbar").classList.remove("show");
    st = {
        cid: c.id, srv: server.key, shards: c.pages || 0,
        cache: {}, authors: {}, top: {s:0, o:0}, bot: {s:0, o:0},
        busy: false, lastday: null, curgroup: null, prevauthor: null, prevtime: 0,
        atlive: true,
    };
    if (!st.shards) {showlock(c); return}

    const tail = jumpshard == null;
    const start = tail ? st.shards - 1 : jumpshard;
    const shard = await getshard(start);
    let off = 0;
    if (jumpid) {
        const oi = shard.messages.findIndex((m) => m.id === jumpid);
        off = oi > 0 ? Math.max(0, oi - 40) : 0;
        st.atlive = false;
    } else if (tail) {
        off = Math.max(0, shard.messages.length - batch);
    }
    st.top = {s:start, o:off};
    st.bot = {s:start, o:off};
    await renderforward();
    if (tail) {
        box.scrollTop = box.scrollHeight;
        await fillbackward();
        box.scrollTop = box.scrollHeight;
    } else if (jumpid) {
        await fillforward();
        highlight(jumpid);
    }
    updatebar();
    box.onscroll = onscroll;
}

function showlock(c) {
    q(".messages").innerHTML =
        '<div class=lockscreen>' +
        '<img class=lockicon src="other/hidden.svg" alt="">' +
        '<h2>This is a hidden text channel</h2>' +
        '<p>You cannot see the messages of this channel.</p></div>';
}

// "view older messages"
function updatebar() {
    const box = q(".messages");
    const btm = box.scrollHeight - box.scrollTop - box.clientHeight;
    q(".olderbar").classList.toggle("show", !st.atlive || btm > box.clientHeight);
}
function jumppresent() {
    if (!st) return;
    if (st.atlive) {
        const box = q(".messages");
        box.scrollTop = box.scrollHeight;
        updatebar();
    } else if (chan) {
        openchannel(chan);
    }
}

async function fillforward() {
    const box = q(".messages");
    let guard = 0;
    while (box.scrollHeight <= box.clientHeight + 80 && guard++ < 30) {
        const more = await renderforward();
        if (!more) break;
    }
}
async function fillbackward() {
    const box = q(".messages");
    let guard = 0;
    while (box.scrollHeight <= box.clientHeight + 200 &&
           (st.top.s > 0 || st.top.o > 0) && guard++ < 30) {
        await renderbackward();
    }
}

function newgroup(frag) {
    const g = el("div", "chatlogmessage-group");
    frag.appendChild(g);
    st.curgroup = g;
    return g;
}

async function renderforward() {
    let shard = st.cache[st.bot.s] || await getshard(st.bot.s);
    if (st.bot.o >= shard.messages.length) {
        if (st.bot.s + 1 >= st.shards) {st.atlive = true; updatebar(); return false}
        st.bot.s++; st.bot.o = 0;
        shard = await getshard(st.bot.s);
    }
    const slice = shard.messages.slice(st.bot.o, st.bot.o + batch);
    st.bot.o += slice.length;
    const frag = document.createDocumentFragment();
    st.curgroup = null;
    slice.forEach((m) => appendmsg(m, frag));
    q(".messages").appendChild(frag);
    return true;
}

async function renderbackward() {
    if (st.top.o === 0) {
        if (st.top.s === 0) return false;
        st.top.s--;
        st.top.o = (await getshard(st.top.s)).messages.length;
    }
    const shard = await getshard(st.top.s);
    const start = Math.max(0, st.top.o - batch);
    const slice = shard.messages.slice(start, st.top.o);
    st.top.o = start;
    const frag = document.createDocumentFragment();
    let group = null, prevauthor = null, prevtime = 0, lastday = null;
    slice.forEach((m) => {
        const d = snowdate(m.id);
        const dk = daykey(d);
        if (dk !== lastday) {
            frag.appendChild(el("div", "daydivider", "<span>" + fmtday(d) + "</span>"));
            lastday = dk; prevauthor = null; group = null;
        }
        const same = m.author === prevauthor && !m.reply &&
                     (d.getTime() - prevtime) < 7 * 60000 && group;
        if (!same) {group = el("div", "chatlogmessage-group"); frag.appendChild(group)}
        group.appendChild(msgel(m, !same, d));
        prevauthor = m.author; prevtime = d.getTime();
    });
    const box = q(".messages");
    const prevh = box.scrollHeight, prevt = box.scrollTop;
    box.insertBefore(frag, box.firstChild);
    box.scrollTop = prevt + (box.scrollHeight - prevh);
    return true;
}

function appendmsg(m, frag) {
    const d = snowdate(m.id);
    const dk = daykey(d);
    if (dk !== st.lastday) {
        frag.appendChild(el("div", "daydivider", "<span>" + fmtday(d) + "</span>"));
        st.lastday = dk; st.prevauthor = null; st.curgroup = null;
    }
    const same = m.author === st.prevauthor && !m.reply &&
                 (d.getTime() - st.prevtime) < 7 * 60000 && st.curgroup;
    if (!same) newgroup(frag);
    st.curgroup.appendChild(msgel(m, !same, d));
    st.prevauthor = m.author; st.prevtime = d.getTime();
}

let ticking = false;
function onscroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(async () => {
        ticking = false;
        const box = q(".messages");
        updatebar();
        if (st.busy) return;
        const btm = box.scrollHeight - box.scrollTop - box.clientHeight;
        if (box.scrollTop < 600 && (st.top.s > 0 || st.top.o > 0)) {
            st.busy = true; await renderbackward(); st.busy = false;
        } else if (btm < 800) {
            st.busy = true; await renderforward(); st.busy = false;
        }
    });
}

/*//////////////////////////////////////////////////////////////////////*/

// collapse the literal newlines
function rendercontent(html) {
    html = html.replace(/\n*(<h[1-3]>)/g, "$1").replace(/(<\/h[1-3]>)\n*/g, "$1");
    return html.split("\n").map((line) => {
        const m = line.match(/^(\s*)-#\s(.*)$/);
        return m ? m[1] + "<span class=sub>" + m[2] + "</span>" : line;
    }).join("\n");
}

function msgel(m, head, d) {
    const a = st.authors[m.author] || {name: typeof m.author === "string" ? m.author : "unknown"};
    const cont = el("div", "chatlogmessage-container");
    cont.dataset.mid = m.id;
    const msg = el("div", "chatlogmessage");

    const aside = el("div", "chatlogmessage-aside");
    if (head) {
        const av = el("img", "chatlogavatar");
        av.loading = "lazy";
        av.src = a.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
        av.onerror = function () {this.src = "https://cdn.discordapp.com/embed/avatars/0.png"};
        aside.appendChild(av);
    } else {
        aside.appendChild(el("span", "chatlogshort-timestamp", fmttime(d)));
    }
    msg.appendChild(aside);

    const prim = el("div", "chatlogmessage-primary");
    if (head) {
        const h = el("div", "chatlogheader");
        const au = el("span", "chatlogauthor", esc(a.name));
        if (a.color) au.style.color = a.color;
        h.appendChild(au);
        if (a.bot) h.appendChild(el("span", "chatlogauthor-tag", esc(a.bot)));
        const ts = el("span", "chatlogtimestamp", fmtfull(d));
        ts.title = fmtfull(d);
        h.appendChild(ts);
        prim.appendChild(h);
    }
    if (m.content) prim.appendChild(el("div", "chatlogcontent", rendercontent(m.content)));
    if (m.attachments) m.attachments.forEach((at) => prim.appendChild(attachel(at)));
    if (m.embeds) m.embeds.forEach((e) => prim.appendChild(embedel(e)));
    if (m.stickers) m.stickers.forEach((s) => prim.appendChild(stickerel(s)));
    if (m.reactions) prim.appendChild(reactionsel(m.reactions));

    msg.appendChild(prim);
    if (m.reply) cont.appendChild(replyel(m.reply));
    cont.appendChild(msg);
    if (window.twemoji) twemoji.parse(cont, twopts);
    cont.querySelectorAll("img.e").forEach((im) => {
        const name = (im.getAttribute("alt") || "").replace(/:/g, "");
        const alt = im.alt || "";
        const urls = name ? [localemoji(name, "webp"), localemoji(name, "gif")] : [];
        onerrorchain(im, urls, () => im.replaceWith(document.createTextNode(alt)));
    });
    return cont;
}

function avatarforname(name) {
    if (!st) return null;
    const n = Object.keys(st.authors).length;
    if (!st.namemap || st.namemapn !== n) {
        st.namemap = {}; st.namemapn = n;
        for (const uid in st.authors) {
            const a = st.authors[uid];
            if (a.name && a.avatar && !(a.name in st.namemap)) st.namemap[a.name] = a.avatar;
        }
    }
    return st.namemap[name] || null;
}
function replyel(rep) {
    const r = el("div", "chatlogreply");
    r.appendChild(el("div", "chatlogreply-symbol"));
    const body = el("div", "chatlogreply-body");
    const im = el("img", "chatlogreply-avatar");
    im.loading = "lazy";
    im.src = avatarforname(rep.author) || "https://cdn.discordapp.com/embed/avatars/0.png";
    im.onerror = function () {this.src = "https://cdn.discordapp.com/embed/avatars/0.png"};
    body.appendChild(im);
    if (rep.author) body.appendChild(el("span", "chatlogreply-author", esc(rep.author)));
    body.appendChild(el("span", "chatlogreply-content", esc(rep.content || "")));
    r.appendChild(body);
    if (rep.target) r.onclick = () => highlight(rep.target);
    else r.style.cursor = "default";
    return r;
}

function trychain(img, steps, onfail) {
    let i = 0;
    img.onerror = function () {
        i++;
        if (i < steps.length) {img.src = steps[i]}
        else {img.onerror = null; onfail()}
    };
    img.src = steps[0];
}
function onerrorchain(img, urls, onfail) {
    let i = 0;
    img.onerror = function () {
        if (i < urls.length) {img.src = urls[i++]}
        else {img.onerror = null; onfail()}
    };
}
function cdnsteps(url) {
    let path = "";
    try {path = new URL(url).pathname} catch (e) {path = ""}
    if (!path) return [url];
    // or try the fix cdn extension backend
    const fix = "https://fixcdn.hyonsu.com" + path;
    // of if that somehow fails to proxying it
    return [url, fix, "https://cors.coolsite.cv/?url=" + encodeURIComponent(fix)];
    // or if nothing works it's OVER. FUCK...................
}
function imgchain(img, url, onfail) {trychain(img, cdnsteps(url), onfail)}

function attachel(at) {
    const wrap = el("div", "chatlogattachment");
    const isimg = at.kind === "media" && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(at.url);
    const isvid = at.kind === "media" && /\.(mp4|webm|mov)(\?|$)/i.test(at.url);
    if (isimg) {
        const a = el("a");
        a.href = at.url; a.target = "_blank"; a.rel = "noopener";
        const img = el("img", "chatlogattachment-media");
        img.loading = "lazy"; img.alt = at.name || "image";
        imgchain(img, at.url, () => genericfile(wrap, at));
        a.appendChild(img);
        wrap.appendChild(a);
    } else if (isvid) {
        const v = el("video", "chatlogattachment-media");
        v.controls = true; v.preload = "none"; v.src = at.url;
        wrap.appendChild(v);
    } else {
        genericfile(wrap, at);
    }
    return wrap;
}
function genericfile(wrap, at) {
    wrap.innerHTML = "";
    const g = el("div", "chatlogattachment-generic");
    const a = el("a", "chatlogattachment-generic-name", "&#128206; " + esc(at.name || "attachment"));
    a.href = at.url; a.target = "_blank"; a.rel = "noopener";
    g.appendChild(a);
    wrap.appendChild(g);
    tw(g);
}

function embedel(e) {
    const wrap = el("div", "chatlogembed");
    const pill = el("div", "chatlogembed-color-pill");
    if (e.color) pill.style.background = e.color;
    wrap.appendChild(pill);
    const cc = el("div", "chatlogembed-content-container");
    if (e.author) cc.appendChild(el("div", "chatlogembed-author", esc(e.author)));
    if (e.title) cc.appendChild(el("div", "chatlogembed-title", e.title));
    if (e.description) cc.appendChild(el("div", "chatlogembed-description", rendercontent(e.description)));
    if (e.fields) e.fields.forEach((f) => {
        const fl = el("div", "chatlogembed-field");
        fl.appendChild(el("div", "chatlogembed-field-name", esc(f.name || "")));
        fl.appendChild(el("div", "chatlogembed-field-value", rendercontent(f.value || "")));
        cc.appendChild(fl);
    });
    if (e.image) {
        const im = el("img", "chatlogembed-image");
        im.loading = "lazy";
        imgchain(im, e.image, () => im.remove());
        cc.appendChild(im);
    }
    wrap.appendChild(cc);
    if (e.thumbnail) {
        const t = el("img", "chatlogembed-thumbnail");
        t.loading = "lazy";
        imgchain(t, e.thumbnail, () => t.remove());
        wrap.appendChild(t);
    }
    return wrap;
}

function stickerel(s) {
    const wrap = el("div", "chatlogsticker");
    wrap.title = s.name || "sticker";
    const im = el("img");
    im.loading = "lazy"; im.alt = s.name || "sticker";
    const steps = s.name ? [s.url, localsticker(s.name, "png"), localsticker(s.name, "gif")] : [s.url];
    trychain(im, steps, () => {wrap.textContent = "[sticker: " + (s.name || "") + "]"});
    wrap.appendChild(im);
    return wrap;
}

function reactionsel(rs) {
    const wrap = el("div", "chatlogreactions");
    rs.forEach((r) => {
        const d = el("div", "chatlogreaction");
        const name = String(r.emoji);
        if (/^[\w~.\-]{2,}$/.test(name)) {
            const im = el("img", "chatlogreaction-emoji");
            im.loading = "lazy"; im.alt = name;
            onerrorchain(im, [localemoji(name, "gif")],
                () => im.replaceWith(document.createTextNode(name)));
            im.src = localemoji(name, "webp");
            d.appendChild(im);
        } else {
            d.appendChild(el("span", "chatlogreaction-emoji", esc(name)));
        }
        d.appendChild(el("span", "chatlogreaction-count", esc(String(r.count))));
        wrap.appendChild(d);
    });
    return wrap;
}

/*//////////////////////////////////////////////////////////////////////*/

async function highlight(mid) {
    let node = q('.messages [data-mid="' + mid + '"]');
    if (!node && st) {
        const i = await findshard(mid);
        if (i != null) {await openchannel(chan, i, mid); return}
    }
    if (node) {
        node.scrollIntoView({block:"center"});
        node.classList.add("chatlogmessagecontainerhighlighted");
        setTimeout(() => node.classList.remove("chatlogmessagecontainerhighlighted"), 2500);
    }
}

async function findshard(mid) {
    let lo = 0, hi = st.shards - 1;
    const target = BigInt(mid);
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        const data = await getshard(m);
        const first = BigInt(data.messages[0].id);
        const last = BigInt(data.messages[data.messages.length - 1].id);
        if (target < first) hi = m - 1;
        else if (target > last) lo = m + 1;
        else return m;
    }
    return null;
}

/*//////////////////////////////////////////////////////////////////////*/

const searchconc = 8;
let searchtoken = 0;

function ensurepanel() {
    let p = q(".searchpanel");
    if (p) return p;
    p = el("div", "searchpanel");
    p.innerHTML =
        '<div class=searchhead><span class=searchtitle></span><span class=searchclose>&times;</span></div>' +
        '<div class=searchprog><div></div></div>' +
        '<div class=results></div>';
    q(".main").appendChild(p);
    q(".searchclose").onclick = closesearch;
    return p;
}
function closesearch() {
    searchtoken++;
    const p = q(".searchpanel");
    if (p) p.remove();
}

function striptags(s) {return s.replace(/<[^>]+>/g, " ")}
function dayrange(s) {
    const d = new Date(s);
    if (isNaN(d)) return null;
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return {start: start, end: start + 86400000};
}
function snippet(text, term) {
    if (!term) return esc(text.slice(0, 200));
    const lc = text.toLowerCase(), i = lc.indexOf(term);
    if (i < 0) return esc(text.slice(0, 180));
    const a = Math.max(0, i - 60), b = Math.min(text.length, i + term.length + 80);
    return (a > 0 ? "..." : "") + esc(text.slice(a, i)) +
        "<mark>" + esc(text.slice(i, i + term.length)) + "</mark>" +
        esc(text.slice(i + term.length, b)) + (b < text.length ? "..." : "");
}
function parsequery(raw) {
    const ops = {from: [], mentions: [], has: [], in: [], before: null, during: null, after: null};
    const terms = [];
    raw.split(/\s+/).forEach((tok) => {
        const m = tok.match(/^(from|mentions|has|in|before|during|after):(.+)$/i);
        if (m) {
            const k = m[1].toLowerCase(), v = m[2];
            if (k === "before" || k === "during" || k === "after") ops[k] = dayrange(v);
            else ops[k].push(v.toLowerCase());
        } else if (tok) terms.push(tok.toLowerCase());
    });
    ops.text = terms.join(" ");
    ops.active = !!(ops.text || ops.from.length || ops.mentions.length ||
                    ops.has.length || ops.before || ops.during || ops.after);
    return ops;
}
function matchmsg(m, hay, author, ops) {
    const lc = hay.toLowerCase(), au = String(author).toLowerCase();
    if (ops.text && lc.indexOf(ops.text) < 0 && au.indexOf(ops.text) < 0) return false;
    if (ops.from.length && !ops.from.some((f) => au.indexOf(f) >= 0)) return false;
    if (ops.mentions.length && !ops.mentions.some((x) => lc.indexOf("@" + x) >= 0)) return false;
    for (const h of ops.has) {
        if (h === "link" && !/https?:\/\//i.test(m.content || "")) return false;
        if (h === "embed" && !m.embeds) return false;
        if (h === "file" && !m.attachments) return false;
        if (h === "image" && !(m.attachments && m.attachments.some((a) => a.kind === "media"))) return false;
    }
    if (ops.before || ops.during || ops.after) {
        const t = snowdate(m.id).getTime();
        if (ops.before && t >= ops.before.start) return false;
        if (ops.after && t < ops.after.end) return false;
        if (ops.during && (t < ops.during.start || t >= ops.during.end)) return false;
    }
    return true;
}

async function runsearch(query) {
    query = query.trim();
    if (query.length < 2) {closesearch(); return}
    ensurepanel();
    const results = q(".results");
    results.innerHTML = "";
    q(".searchprog div").style.width = "0";
    q(".searchtitle").innerHTML = 'searching for <b>' + esc(query) + '</b>...';

    const token = ++searchtoken;
    const ops = parsequery(query);
    const cname = {}, groups = {};
    manifest.servers.forEach((s) => s.categories.forEach((c) =>
        c.channels.forEach((ch) => {cname[s.key + "/" + ch.id] = ch.name})));
    function groupbox(srv, cid) {
        const key = srv + "/" + cid;
        if (groups[key]) return groups[key];
        const cn = cname[key] || cid;
        results.appendChild(el("div", "reschanhead",
            '<span class=chanhash>' + chanicon(cn) + '</span>' + esc(striphash(cn))));
        const box = el("div", "resgroup");
        results.appendChild(box);
        return (groups[key] = box);
    }
    function settitle(count) {
        q(".searchtitle").innerHTML = '<b>' + count + (count >= 2000 ? "+" : "") +
            '</b> Results for <b>' + esc(query) + '</b>';
    }
    if (!ops.active) {q(".searchtitle").innerHTML = 'no results for <b>' + esc(query) + '</b>'; return}

    const jobs = [];
    manifest.servers.forEach((s) => s.categories.forEach((cat) =>
        cat.channels.forEach((ch) => {
            if (!ch.pages || !ch.count) return;
            if (ops.in.length &&
                !ops.in.some((x) => striphash(ch.name).toLowerCase().includes(x))) return;
            for (let p = 0; p < ch.pages; p++) jobs.push({srv: s.key, cid: ch.id, page: p});
        })));
    const total = jobs.length || 1;
    let done = 0, count = 0, next = 0;

    async function handle(job) {
        let data = null;
        try {data = await loadjson(shardpath(job.srv, job.cid, job.page))} catch (e) {}
        if (token !== searchtoken) return;
        if (data) {
            const authors = data.authors || {};
            for (const m of data.messages) {
                let hay = m.content ? striptags(m.content) : "";
                if (m.embeds) for (const e of m.embeds)
                    hay += " " + (e.title ? striptags(e.title) : "") +
                           " " + (e.description ? striptags(e.description) : "") +
                           " " + (e.author || "");
                const ao = authors[m.author] || null;
                const au = ao ? ao.name : (m.author || "");
                if (count < 2000 && matchmsg(m, hay, au, ops)) {
                    count++;
                    groupbox(job.srv, job.cid).appendChild(resultcard(
                        {srv: job.srv, cid: job.cid, id: m.id, author: au, ao: ao,
                         snippet: snippet(hay.trim() || ("@" + au), ops.text)}));
                }
            }
        }
        done++;
        q(".searchprog div").style.width = (100 * done / total) + "%";
        settitle(count);
    }
    async function pool() {
        while (next < jobs.length && token === searchtoken) await handle(jobs[next++]);
    }
    await Promise.all(Array.from({length: searchconc}, () => pool()));
    if (token !== searchtoken) return;
    q(".searchprog div").style.width = "100%";
    if (!count) q(".searchtitle").innerHTML = 'no results for <b>' + esc(query) + '</b>';
    setTimeout(() => {const b = q(".searchprog div"); if (b) b.style.width = "0"}, 600);
}

function resultcard(h) {
    const ao = h.ao || {name: h.author};
    const r = el("div", "result");
    const row = el("div", "resultmsg");
    const av = el("img", "resultav");
    av.loading = "lazy";
    av.src = ao.avatar || "https://cdn.discordapp.com/embed/avatars/0.png";
    av.onerror = function () {this.src = "https://cdn.discordapp.com/embed/avatars/0.png"};
    const body = el("div", "resultbody");
    const au = el("span", "resultauthor", esc(ao.name || h.author));
    if (ao.color) au.style.color = ao.color;
    const line = el("div", "resultline");
    line.appendChild(au);
    line.appendChild(el("span", "resulttime", fmtfull(snowdate(h.id))));
    body.appendChild(line);
    body.appendChild(el("div", "resulttext", h.snippet));
    row.appendChild(av);
    row.appendChild(body);
    r.appendChild(row);
    if (window.twemoji) twemoji.parse(r, twopts);
    r.onclick = () => jumphit(h);
    return r;
}

async function jumphit(h) {
    const t = findchannel(h.srv, h.cid);
    if (!t) return;
    if (t.srv.key !== (server && server.key)) selectserver(t.srv);
    closesearch();
    if (!chan || chan.id !== h.cid) await openchannel(t.ch);
    await highlight(h.id);
}
function findchannel(srv, cid) {
    const s = manifest.servers.find((x) => x.key === srv);
    if (!s) return null;
    for (const cat of s.categories) {
        const ch = cat.channels.find((c) => c.id === cid);
        if (ch) return {srv: s, ch: ch};
    }
    return null;
}

/*//////////////////////////////////////////////////////////////////////*/

function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
        ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;"}[c]));
}

document.addEventListener("click", (ev) => {
    const sp = ev.target.closest && ev.target.closest(".s");
    if (sp) sp.classList.add("revealed");
});

q(".olderbar .jumppresent").onclick = jumppresent;
q(".messages").addEventListener("load", (e) => {
    if (e.target.tagName !== "IMG" || !st || !st.atlive) return;
    const m = q(".messages");
    if (m.scrollHeight - m.scrollTop - m.clientHeight < 300) m.scrollTop = m.scrollHeight;
}, true);

const searchinput = q(".search");
const searchicon = q(".searchicon");
function refreshsearchicon() {
    const has = searchinput.value.length > 0;
    q(".searchwrap").classList.toggle("hastext", has);
    searchicon.innerHTML = has ? svgclear : svgsearch;
}
refreshsearchicon();
searchinput.addEventListener("input", refreshsearchicon);
searchinput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runsearch(e.target.value);
    if (e.key === "Escape") {e.target.value = ""; refreshsearchicon(); closesearch()}
});
searchicon.onclick = () => {
    if (!searchinput.value) {searchinput.focus(); return}
    searchinput.value = "";
    refreshsearchicon();
    closesearch();
    searchinput.focus();
};

/*//////////////////////////////////////////////////////////////////////*/

(async function init() {
    try {
        manifest = await (await fetch(manifesturl)).json();
    } catch (e) {
        q(".guildname").textContent = "failed to load manifest";
        return;
    }
    buildrail();
    if (manifest.servers.length) selectserver(manifest.servers[0]);
})();
