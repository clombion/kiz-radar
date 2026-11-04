// A community's page for a shared link (public/c/<key>/index.html) sends a visitor on to its page on the site at once,
// keeping no step in the history; its refresh does the same where scripts don't run.
const key = document.querySelector('meta[name="kiz-community"]')?.getAttribute('content');
if (key) location.replace(`../../#community/${encodeURIComponent(key)}`);
