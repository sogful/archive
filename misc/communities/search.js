//   "exact phrase"
//   sog OR fog
//   +yeahhhh
//   -word / -"phrase"
//   #tag / $cashtag
//   @user
//   from:user / to:user
//   lang:en
//   url:domain

//   since:YYYY-MM-DD
//   until:YYYY-MM-DD
//   since_id:ID / max_id:ID
//   since_time:N / until_time:N
//   within_time:5m

//   min_faves:N
//   min_retweets / min_replies    same shape
//   min_quotes / min_views        same shape

//   filter:retweets / -filter:retweets
//   filter:replies
//   filter:self_threads
//   filter:quote
//   filter:has_engagement

//   filter:media
//   filter:twimg
//   filter:images
//   filter:videos
//   filter:native_video
//   filter:consumer_video
//   filter:pro_video

//   filter:links
//   filter:mentions
//   filter:hashtags
//   filter:safe
//   filter:verified

//   conversation_id:ID
//   quoted_tweet_id:ID

/*//////////////////////////////////////////////////////////////////////*/

"use strict";

function parsedate(s) {
    if (!s) return 0;
    if (typeof s === "string" && /_\d{2}:\d{2}:\d{2}_/.test(s)) {
        const m = s.match(/^(\d{4}-\d{2}-\d{2})_(\d{2}:\d{2}:\d{2})_(\w+)$/);
        if (m) {
            const iso = m[1] + "T" + m[2] + (m[3].toUpperCase() === "UTC" ? "Z" : "");
            const d = new Date(iso);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        }
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function cmpid(a, b, op) {
    try {
        const A = BigInt(a), B = BigInt(b);
        if (op === "gt") return A > B;
        if (op === "le") return A <= B;
    } catch (e) { return true; }
    return true;
}

function parsewithintime(spec) {
    const m = String(spec).match(/^(\d+)([dhms])$/i);
    if (!m) return 0;
    const n = +m[1];
    const unit = m[2].toLowerCase();
    const k = unit === "d" ? 86400000 : unit === "h" ? 3600000 : unit === "m" ? 60000 : 1000;
    return n * k;
}

function phrasematcher(phrase) {
    const lc = phrase.toLowerCase();
    if (lc.indexOf("*") < 0) {
        return (text) => text.includes(lc);
    }
    const re = new RegExp(lc.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
    return (text) => re.test(text);
}

/*//////////////////////////////////////////////////////////////////////*/

export function parsetweetquery(query) {
    const groups = splitorgroups(query);
    return {or: groups.map(parsetweetgroup)};
}

export function parseuserquery(query) {
    const groups = splitorgroups(query);
    return {or: groups.map(parseusergroup)};
}

function splitorgroups(query) {
    if (!query) return [""];
    const tokens = [];
    let buf = "";
    let inquote = false;
    for (let i = 0; i < query.length; i++) {
        const ch = query[i];
        if (ch === '"') { inquote = !inquote; buf += ch; continue; }
        if (!inquote && ch === " " && query.slice(i + 1, i + 4) === "OR " ) {
            tokens.push(buf);
            buf = "";
            i += 3;
            continue;
        }
        buf += ch;
    }
    tokens.push(buf);
    return tokens.length ? tokens : [""];
}

/*//////////////////////////////////////////////////////////////////////*/

function parsetweetgroup(query) {
    const p = newtweetparams();

    query = query.replace(/-"([^"]+)"/g, (_, t) => { p.excludephrases.push(phrasematcher(t)); return " "; });
    query = query.replace(/"([^"]+)"/g,  (_, t) => { p.phrases.push(phrasematcher(t)); return " "; });

    query = query.replace(/(^|\s)(?:-filter|exclude):([\w_]+)/gi, (full, sp, name) => {
        applyfilterflag(p, name.toLowerCase(), false);
        return sp || " ";
    });

    query = query.replace(/(^|\s)filter:([\w_]+)/gi, (full, sp, name) => {
        applyfilterflag(p, name.toLowerCase(), true);
        return sp || " ";
    });

    // the great wall of regex
    // reminds me of s.soggy.cat/info which gave mat nightmares
    const numops = [
        [/(^|\s)-min_faves:(\d+)/gi,    (m) => p.maxfaves    = +m[2]],
        [/(^|\s)-min_retweets:(\d+)/gi, (m) => p.maxretweets = +m[2]],
        [/(^|\s)-min_replies:(\d+)/gi,  (m) => p.maxreplies  = +m[2]],
        [/(^|\s)-min_quotes:(\d+)/gi,   (m) => p.maxquotes   = +m[2]],
        [/(^|\s)-min_views:(\d+)/gi,    (m) => p.maxviews    = +m[2]],
        [/(^|\s)min_faves:(\d+)/gi,     (m) => p.minfaves    = +m[2]],
        [/(^|\s)min_retweets:(\d+)/gi,  (m) => p.minretweets = +m[2]],
        [/(^|\s)min_replies:(\d+)/gi,   (m) => p.minreplies  = +m[2]],
        [/(^|\s)min_quotes:(\d+)/gi,    (m) => p.minquotes   = +m[2]],
        [/(^|\s)min_views:(\d+)/gi,     (m) => p.minviews    = +m[2]],
    ];
    for (const [re, set] of numops) {
        query = query.replace(re, (full, sp, val) => { set({2: val}); return sp || " "; });
    }

    const valops = [
        [/(^|\s)from:([\w_]+)/gi,       (v) => p.from = v.toLowerCase()],
        [/(^|\s)to:([\w_]+)/gi,         (v) => p.to   = v.toLowerCase()],
        [/(^|\s)lang:(\w+)/gi,          (v) => p.lang = v.toLowerCase()],
        [/(^|\s)url:(\S+)/gi,           (v) => p.url  = v],
        [/(^|\s)since:(\d{4}-\d{2}-\d{2}(?:_\d{2}:\d{2}:\d{2}_\w+)?)/gi, (v) => p.since = v],
        [/(^|\s)until:(\d{4}-\d{2}-\d{2}(?:_\d{2}:\d{2}:\d{2}_\w+)?)/gi, (v) => p.until = v],
        [/(^|\s)since_id:(\d+)/gi,      (v) => p.sinceid = v],
        [/(^|\s)max_id:(\d+)/gi,        (v) => p.maxid = v],
        [/(^|\s)since_time:(\d+)/gi,    (v) => p.sincetime = +v],
        [/(^|\s)until_time:(\d+)/gi,    (v) => p.untiltime = +v],
        [/(^|\s)within_time:(\d+[dhms])/gi, (v) => p.withinms = parsewithintime(v)],
        [/(^|\s)conversation_id:(\d+)/gi,  (v) => p.conversationid = v],
        [/(^|\s)quoted_tweet_id:(\d+)/gi,  (v) => p.quotedtweetid  = v],
        [/(^|\s)quoted_user_id:(\d+)/gi,   (v) => p.quoteduserid   = v],
    ];
    for (const [re, set] of valops) {
        query = query.replace(re, (full, sp, val) => { set(val); return sp || " "; });
    }

    query = query.replace(/(^|\s)@([\w_]+)/g, (full, sp, h) => { p.mentions.push(h.toLowerCase()); return sp || " "; });
    query = query.replace(/(^|\s)[#$]([\w]+)/g, (full, sp, h) => { p.terms.push(h.toLowerCase()); return sp || " "; });
    query = query.replace(/(^|\s)\+(\S+)/g, (full, sp, w) => { p.terms.push(w.toLowerCase()); return sp || " "; });
    query = query.replace(/(^|\s)-(\S+)/g, (full, sp, w) => { p.excludeterms.push(w.toLowerCase()); return sp || " "; });

    const remainder = query.trim();
    if (remainder) for (const w of remainder.split(/\s+/)) p.terms.push(w.toLowerCase());
    return p;
}

function newtweetparams() {
    return {
        terms: [], excludeterms: [],
        phrases: [], excludephrases: [],
        lang: null, url: null, from: null, to: null,
        mentions: [],
        since: null, until: null, sinceid: null, maxid: null,
        sincetime: null, untiltime: null, withinms: null,
        minfaves: null, minretweets: null, minreplies: null, minquotes: null, minviews: null,
        maxfaves: null, maxretweets: null, maxreplies: null, maxquotes: null, maxviews: null,
        hasmedia: null, hastwimg: null, hasimages: null, hasvideos: null,
        hasnativevideo: null, hasconsumervideo: null, hasprovideo: null,
        haslinks: null, hasmentions: null, hashashtags: null,
        issafe: null, isverified: null,
        isreply: null, isquote: null, isretweet: null, isselfthread: null,
        hasengagement: null,
        conversationid: null, quotedtweetid: null, quoteduserid: null,
    };
}

function applyfilterflag(p, name, val) {
    switch (name) {
        case "media":          p.hasmedia          = val; break;
        case "twimg":          p.hastwimg          = val; break;
        case "images":         p.hasimages         = val; break;
        case "videos":         p.hasvideos         = val; break;
        case "native_video":   p.hasnativevideo    = val; break;
        case "consumer_video": p.hasconsumervideo  = val; break;
        case "pro_video":      p.hasprovideo       = val; break;
        case "links":          p.haslinks          = val; break;
        case "mentions":       p.hasmentions       = val; break;
        case "hashtags":       p.hashashtags       = val; break;
        case "safe":           p.issafe            = val; break;
        case "verified":       p.isverified        = val; break;
        case "blue_verified":  p.isverified        = val; break;
        case "replies":        p.isreply           = val; break;
        case "self_threads":   p.isselfthread      = val; break;
        case "quote":          p.isquote           = val; break;
        case "retweets":       p.isretweet         = val; break;
        case "nativeretweets": p.isretweet         = val; break;
        case "has_engagement": p.hasengagement     = val; break;
    }
}

/*//////////////////////////////////////////////////////////////////////*/

export function matchtweet(t, params, ctx) {
    const groups = (params && params.or) || [params];
    for (const p of groups) {
        if (matchtweetgroup(t, p, ctx)) return true;
    }
    return false;
}

function matchtweetgroup(t, p, ctx) {
    const userbyid = (ctx && ctx.userbyid) || null;
    const text = (t.text || "").toLowerCase();

    for (const term of p.terms) {
        if (!text.includes(term)) return false;
    }
    for (const term of p.excludeterms) {
        if (text.includes(term)) return false;
    }
    for (const match of p.phrases) {
        if (!match(text)) return false;
    }
    for (const match of p.excludephrases) {
        if (match(text)) return false;
    }

    if (p.lang && (t.lang || "").toLowerCase() !== p.lang) return false;
    if (p.url && !text.includes(p.url.toLowerCase())) return false;

    if (p.from) {
        const u = userbyid && userbyid.get(t.user_id);
        if (!u || (u.username || "").toLowerCase() !== p.from) return false;
    }
    if (p.to) {
        const irsn = (t.in_reply_to && t.in_reply_to.screen_name || "").toLowerCase();
        if (irsn !== p.to) return false;
    }
    if (p.mentions.length) {
        const ms = (t.mentions || []).map(m => m.toLowerCase());
        for (const m of p.mentions) if (!ms.includes(m)) return false;
    }

    const hasmedia       = !!(t.media && t.media.length);
    const hastwimg       = hasmedia && t.media.some(m => /pbs\.twimg\.com|video\.twimg\.com/i.test(m.thumbnail || m.video_url || ""));
    const hasimages      = hasmedia && t.media.some(m => (m.type || "photo") === "photo");
    const hasvideos      = hasmedia && t.media.some(m => m.type === "video" || m.type === "animated_gif");
    const hasnativevideo = hasvideos;
    const hasconsumervideo = hasmedia && t.media.some(m => m.type === "video");
    const hasprovideo    = hasmedia && t.media.some(m => m.type === "animated_gif" || (m.type === "video" && /amplify_video/i.test(m.video_url || "")));
    const haslinks       = (t.urls && t.urls.length > 0) || /(^|\s)https?:\/\//.test(t.text || "");
    const hasmentions    = !!(t.mentions && t.mentions.length);
    const hashashtags    = !!(t.hashtags && t.hashtags.length);
    const issafe         = !t.possibly_sensitive;
    const isreply        = !!(t.in_reply_to && t.in_reply_to.status_id);
    const isquote        = !!t.quoted_id;
    const isretweet      = !!t.retweeted_id;

    const isselfthread   = isreply && t.in_reply_to.user_id === t.user_id;
    const engcount       = (t.likes || 0) + (t.retweets || 0) + (t.replies || 0) + (t.quotes || 0);
    const hasengagement  = engcount > 0;
    const isverified     = !!(userbyid && (userbyid.get(t.user_id) || {}).verified);

    const boolchecks = [
        ["hasmedia",         hasmedia],
        ["hastwimg",         hastwimg],
        ["hasimages",        hasimages],
        ["hasvideos",        hasvideos],
        ["hasnativevideo",   hasnativevideo],
        ["hasconsumervideo", hasconsumervideo],
        ["hasprovideo",      hasprovideo],
        ["haslinks",         haslinks],
        ["hasmentions",      hasmentions],
        ["hashashtags",      hashashtags],
        ["issafe",           issafe],
        ["isreply",          isreply],
        ["isquote",          isquote],
        ["isretweet",        isretweet],
        ["isselfthread",     isselfthread],
        ["hasengagement",    hasengagement],
        ["isverified",       isverified],
    ];
    for (const [key, actual] of boolchecks) {
        const want = p[key];
        if (want === null || want === undefined) continue;
        if (want !== actual) return false;
    }

    if (p.conversationid && t.conversation_id !== p.conversationid && t.id !== p.conversationid) return false;
    if (p.quotedtweetid  && t.quoted_id      !== p.quotedtweetid) return false;
    if (p.quoteduserid) {
        if (!ctx || !ctx.byid) return false;
        const q = ctx.byid.get(t.quoted_id);
        if (!q || q.user_id !== p.quoteduserid) return false;
    }

    if (p.since || p.until || p.sincetime || p.untiltime || p.withinms) {
        const ts = parsedate(t.created_at);
        if (!ts) return false;
        if (p.since)     { const d = parsedate(p.since); if (ts < d) return false; }
        if (p.until)     { const d = parsedate(p.until); if (ts >= d + 86400000) return false; }
        if (p.sincetime) { if (ts < p.sincetime * 1000) return false; }
        if (p.untiltime) { if (ts >= p.untiltime * 1000) return false; }
        if (p.withinms)  { if (ts < Date.now() - p.withinms) return false; }
    }
    if (p.sinceid && !cmpid(t.id, p.sinceid, "gt")) return false;
    if (p.maxid   && !cmpid(t.id, p.maxid,   "le")) return false;

    const lk = t.likes || 0, rt = t.retweets || 0, rp = t.replies || 0;
    const qt = t.quotes || 0, vw = t.views || 0;
    if (p.minfaves    !== null && lk < p.minfaves)    return false;
    if (p.maxfaves    !== null && lk > p.maxfaves)    return false;
    if (p.minretweets !== null && rt < p.minretweets) return false;
    if (p.maxretweets !== null && rt > p.maxretweets) return false;
    if (p.minreplies  !== null && rp < p.minreplies)  return false;
    if (p.maxreplies  !== null && rp > p.maxreplies)  return false;
    if (p.minquotes   !== null && qt < p.minquotes)   return false;
    if (p.maxquotes   !== null && qt > p.maxquotes)   return false;
    if (p.minviews    !== null && vw < p.minviews)    return false;
    if (p.maxviews    !== null && vw > p.maxviews)    return false;

    return true;
}

/*//////////////////////////////////////////////////////////////////////*/

function parseusergroup(query) {
    const p = {
        terms: [], excludeterms: [],
        phrases: [], excludephrases: [],
        minfollowers: null, minfollowing: null, minposts: null,
        maxfollowers: null, maxfollowing: null, maxposts: null,
        verified: null,
    };
    query = query.replace(/-"([^"]+)"/g, (_, t) => { p.excludephrases.push(phrasematcher(t)); return " "; });
    query = query.replace(/"([^"]+)"/g,  (_, t) => { p.phrases.push(phrasematcher(t)); return " "; });

    query = query.replace(/(^|\s)(?:-filter|exclude):verified/gi, (full, sp) => { p.verified = false; return sp || " "; });
    query = query.replace(/(^|\s)filter:(?:blue_)?verified/gi,    (full, sp) => { p.verified = true;  return sp || " "; });

    const ops = [
        [/(^|\s)-min_followers:(\d+)/gi, (m) => p.maxfollowers = +m[2]],
        [/(^|\s)-min_following:(\d+)/gi, (m) => p.maxfollowing = +m[2]],
        [/(^|\s)-min_posts:(\d+)/gi,     (m) => p.maxposts     = +m[2]],
        [/(^|\s)min_followers:(\d+)/gi,  (m) => p.minfollowers = +m[2]],
        [/(^|\s)min_following:(\d+)/gi,  (m) => p.minfollowing = +m[2]],
        [/(^|\s)min_posts:(\d+)/gi,      (m) => p.minposts     = +m[2]],
        [/(^|\s)verified:(true|false)/gi, (m) => p.verified = m[2] === "true"],
        [/(^|\s)@([\w_]+)/g,             (m) => p.terms.push(m[2].toLowerCase())],
    ];
    for (const [re, set] of ops) {
        query = query.replace(re, (full, sp, ...rest) => { set({2: rest[0]}); return sp || " "; });
    }
    query = query.replace(/(^|\s)\+(\S+)/g, (full, sp, w) => { p.terms.push(w.toLowerCase()); return sp || " "; });
    query = query.replace(/(^|\s)-(\S+)/g, (full, sp, w) => { p.excludeterms.push(w.toLowerCase()); return sp || " "; });
    const rem = query.trim();
    if (rem) for (const w of rem.split(/\s+/)) p.terms.push(w.toLowerCase());
    return p;
}

export function matchuser(u, params) {
    const groups = (params && params.or) || [params];
    for (const p of groups) {
        if (matchusergroup(u, p)) return true;
    }
    return false;
}

function matchusergroup(u, p) {
    const blob = [
        u.username || "", u.display_name || "", u.bio || "",
        u.location || "", u.url || "",
    ].join(" ").toLowerCase();
    for (const t of p.terms) if (!blob.includes(t)) return false;
    for (const t of p.excludeterms) if (blob.includes(t)) return false;
    for (const match of p.phrases) if (!match(blob)) return false;
    for (const match of p.excludephrases) if (match(blob)) return false;
    if (p.minfollowers !== null && (u.followers || 0) < p.minfollowers) return false;
    if (p.maxfollowers !== null && (u.followers || 0) > p.maxfollowers) return false;
    if (p.minfollowing !== null && (u.following || 0) < p.minfollowing) return false;
    if (p.maxfollowing !== null && (u.following || 0) > p.maxfollowing) return false;
    if (p.minposts     !== null && (u.posts     || 0) < p.minposts)     return false;
    if (p.maxposts     !== null && (u.posts     || 0) > p.maxposts)     return false;
    if (p.verified === true  && !u.verified) return false;
    if (p.verified === false &&  u.verified) return false;
    return true;
}
