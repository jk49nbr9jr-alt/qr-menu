import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- kleine UI-Helpers (Tailwind) ---------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string; pill?: boolean };
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { className?: string };
type DivProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };

const Button: React.FC<ButtonProps> = ({ className = "", pill = false, ...props }) => {
  const radius = pill ? "rounded-full" : "rounded-md";
  return (
    <button
      className={("inline-flex items-center justify-center gap-2 " + radius + " border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-50 " + className).trim()}
      {...props}
    />
  );
};
const PrimaryBtn: React.FC<ButtonProps> = ({ className = "", pill = false, ...props }) => {
  const radius = pill ? "rounded-full" : "rounded-md";
  return (
    <button
      className={("inline-flex items-center justify-center gap-2 " + radius + " bg-black text-white px-3 py-2 text-sm hover:opacity-90 active:opacity-80 disabled:opacity-50 " + className).trim()}
      {...props}
    />
  );
};
const Card: React.FC<DivProps> = ({ className = "", children, ...rest }) => (
  <div className={("rounded-xl border bg-white " + className).trim()} {...rest}>{children}</div>
);
const CardHeader: React.FC<DivProps> = ({ className = "", children, ...rest }) => (
  <div className={("p-4 " + className).trim()} {...rest}>{children}</div>
);
const CardTitle: React.FC<DivProps> = ({ className = "", children, ...rest }) => (
  <div className={("text-base font-semibold " + className).trim()} {...rest}>{children}</div>
);
const CardContent: React.FC<DivProps> = ({ className = "", children, ...rest }) => (
  <div className={("p-4 pt-0 " + className).trim()} {...rest}>{children}</div>
);
const Input: React.FC<InputProps> = ({ className = "", ...props }) => (
  <input className={("w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 " + className).trim()} {...props} />
);
const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = "", ...props }) => (
  <textarea className={("w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 " + className).trim()} {...props} />
);

/* ---------- Daten & Typen ---------- */
type MenuItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  img: string;
  category: string;
};

const BRAND_TITLE = "Speisekarte Urixsoft";
const LOGO_SRC = "/logo.png";
const ADMIN_TOKEN_KEY = "qrmenu.admin.token";
const ADMIN_USER_KEY = "qrmenu.admin.user";
const ADMIN_PASSWORD = "admin123"; // Demo-Passwort – später ersetzen

// --- Server API helpers for user management (sync across devices) ---
const ADMIN_SECRET = (import.meta as any).env.VITE_ADMIN_SECRET || "";
if (import.meta.env?.DEV && !ADMIN_SECRET) {
  console.warn("[qr-menu] VITE_ADMIN_SECRET ist leer – Admin-APIs (Passwort/Approve/Delete) werden 400 liefern.");
}

function getAdminSecret(): string {
  // 1) Build-time env injected by Vite (Vercel)
  const env = (import.meta as any)?.env?.VITE_ADMIN_SECRET;
  if (env) return String(env);
  // 2) Fallback: stored locally after a one-time prompt
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("qrmenu.admin.secret");
    if (saved) return saved;
    const ask = prompt("Admin-Secret eingeben:") || "";
    if (ask) localStorage.setItem("qrmenu.admin.secret", ask);
    return ask;
  }
  return "";
}

type UsersResponse = {
  ok: boolean;
  allowed: string[];
  pending: Record<string, string>;
  passwords?: Record<string, string>;
};

async function apiUsersGet(tenant: string, includePasswords = false): Promise<UsersResponse> {
  const headers: Record<string, string> = {};
  if (includePasswords) {
    const secret = getAdminSecret();
    if (secret) headers["x-admin-secret"] = secret;
  }
  const r = await fetch(`/api/users?tenant=${encodeURIComponent(tenant)}`, { headers, cache: "no-store" });
  if (!r.ok) return { ok: false, allowed: ["admin"], pending: {} };
  return r.json();
}
async function serverRegister(username: string, password: string) {
  const tenant = getTenantKey();
  const r = await fetch("/api/users-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant, username, password }),
  });
  let data: any = {};
  try { data = await r.json(); } catch {}
  if (!r.ok || !data?.ok) {
    throw new Error(data?.error || "register-failed");
  }
  return data;
}
async function serverApprove(username: string) {
  const tenant = getTenantKey();
  const secret = getAdminSecret();
  const r = await fetch("/api/users-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ tenant, username }),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function serverReject(username: string) {
  const tenant = getTenantKey();
  const secret = getAdminSecret();
  const r = await fetch("/api/users-reject", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ tenant, username }),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function serverSetPassword(username: string, password: string) {
  const tenant = getTenantKey();
  const secret = getAdminSecret();
  const r = await fetch(`/api/users-set-password?tenant=${encodeURIComponent(tenant)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ tenant, username, password }),
  });
  if (!r.ok) throw new Error(await r.text());
}
async function serverDeleteUser(username: string) {
  const tenant = getTenantKey();
  const secret = getAdminSecret();
  const r = await fetch("/api/users-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify({ tenant, username }),
  });
  if (!r.ok) throw new Error(await r.text());
}

const HEADER_H = 64; // fixe Höhe des fixierten Headers (px)

/* ---------- Tenant-Helfer ---------- */
function getTenantKey() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const first = host.split(".")[0] || "speisekarte";
  if (first === "www" || first.includes("vercel")) return "speisekarte";
  return first;
}

/* ---------- Public: Menü aus JSON laden ---------- */
async function fetchMenu(tenant: string): Promise<MenuItem[]> {
  try {
    const res = await fetch(`/menus/${tenant}.json`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/* ---------- Admin Editor ---------- */
type EditorProps = {
  open: boolean;
  item: MenuItem | null;
  menu: MenuItem[] | null;
  onClose: () => void;
  onSave: (next: MenuItem) => void;
};
const Editor: React.FC<EditorProps> = ({ open, item, menu, onClose, onSave }) => {
  const [draft, setDraft] = useState<MenuItem>(item || { id: Math.random().toString(36).slice(2,9), name: "", desc: "", price: 0, img: "", category: "Burger" });

  useEffect(() => {
    setDraft(item || { id: Math.random().toString(36).slice(2,9), name: "", desc: "", price: 0, img: "", category: "Burger" });
  }, [item, open]);

  const [catOpen, setCatOpen] = useState(false);
  const catBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!catBoxRef.current) return;
      if (!(e.target instanceof Node)) return;
      if (!catBoxRef.current.contains(e.target)) setCatOpen(false);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setCatOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const existingCats = useMemo(() => Array.from(new Set((menu ?? []).map(i => i.category))), [menu]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">{item ? "Artikel bearbeiten" : "Neuer Artikel"}</div>
          <Button onClick={onClose}>Schließen</Button>
        </div>
        <div className="p-4 grid grid-cols-1 gap-3">
          <label className="text-sm">
            <div>Name</div>
            <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="text-sm">
            <div>Beschreibung</div>
            <TextArea rows={3} value={draft.desc} onChange={e => setDraft({ ...draft, desc: e.target.value })} />
          </label>
          <label className="text-sm">
            <div>Preis (€)</div>
            <Input type="number" step="0.01" value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} />
          </label>
          <label className="text-sm">
            <div>Bild-URL</div>
            <Input value={draft.img} onChange={e => setDraft({ ...draft, img: e.target.value })} />
          </label>
          <label className="text-sm">
            <div>Eigenes Bild hochladen</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setDraft({ ...draft, img: String(reader.result) });
                };
                reader.readAsDataURL(file);
              }}
            />
            <div className="text-xs text-neutral-500 mt-1">Tipp: Du kannst entweder eine Bild-URL angeben oder eine Datei auswählen. Beim Upload wird das Bild als Base64 gespeichert.</div>
          </label>
          <label className="text-sm">
            <div>Kategorie</div>
            <div ref={catBoxRef} className="relative">
              {/* Trigger */}
              <button
                type="button"
                onClick={() => setCatOpen(v => !v)}
                className="mt-1 w-full inline-flex items-center justify-between rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-black/10"
                aria-haspopup="listbox"
                aria-expanded={catOpen}
              >
                <span className="truncate">
                  {existingCats.includes(draft.category) && draft.category
                    ? draft.category
                    : draft.category
                      ? `Neue Kategorie: ${draft.category}`
                      : 'Kategorie wählen'}
                </span>
                <span className="ml-3 text-neutral-400">▾</span>
              </button>

              {/* Popover */}
              {catOpen && (
                <div className="absolute z-20 mt-2 w-full rounded-xl border bg-white shadow-lg max-h-60 overflow-auto">
                  {existingCats.map((catOpt) => (
                    <button
                      key={catOpt}
                      type="button"
                      className={`w-full text-left px-4 py-2 hover:bg-neutral-50 ${draft.category === catOpt ? 'bg-neutral-100 font-medium' : ''}`}
                      onClick={() => { setDraft({ ...draft, category: catOpt }); setCatOpen(false); }}
                    >
                      {catOpt}
                    </button>
                  ))}
                  <div className="border-t" />
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 text-amber-700 hover:bg-amber-50"
                    onClick={() => { setDraft({ ...draft, category: '' }); setCatOpen(false); }}
                  >
                    + Neue Kategorie hinzufügen
                  </button>
                </div>
              )}
            </div>

            {/* Inline-Input, falls es eine neue Kategorie ist */}
            {!existingCats.includes(draft.category) && (
              <div className="mt-2">
                <Input
                  placeholder="Neue Kategorie eingeben"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </div>
            )}
          </label>

          {draft.img ? (
            <img src={draft.img} alt="preview" className="mt-2 h-36 w-full object-cover rounded-md border" />
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button onClick={onClose}>Abbrechen</Button>
            <PrimaryBtn onClick={() => onSave(draft)} disabled={!draft.name || !draft.price}>Speichern</PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Öffentliche Ansicht (ohne Admin-UI) ---------- */
function PublicApp() {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [, setFilterOn] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const catRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  // Helper: left-align active category in scroll view
  function alignActiveCatLeft() {
    const container = catRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>(`[data-cat="${CSS.escape(cat)}"]`);
    if (!el) return;
    const pad = 8;
    const target = Math.max(0, el.offsetLeft - container.offsetLeft - pad);
    container.scrollTo({ left: target, behavior: 'smooth' });
  }
  useEffect(() => { alignActiveCatLeft(); }, [cat]);

  function scrollToCategory(targetCat: string) {
    const el = sectionRefs.current[targetCat];
    if (!el) return;
    const toolbarH = (toolbarRef.current?.offsetHeight || 0);
    const y = el.getBoundingClientRect().top + window.scrollY - toolbarH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  useEffect(() => { document.title = BRAND_TITLE; }, []);
  useEffect(() => {
    const tenant = getTenantKey();
    fetchMenu(tenant).then(setMenu);
  }, []);

  const categories = useMemo(() => Array.from(new Set((menu ?? []).map(i => i.category))), [menu]);

  useEffect(() => {
    if (!menu) return;
    const first = categories[0];
    if (!cat && first) {
      setCat(first);
      setFilterOn(false);
      setTimeout(() => alignActiveCatLeft(), 80);
    }
  }, [menu, categories]);

  const grouped = useMemo(() => {
    const items = (menu ?? []).filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    const map: Record<string, MenuItem[]> = {};
    for (const c of categories) map[c] = [];
    for (const it of items) {
      (map[it.category] ||= []).push(it);
    }
    return categories.map(c => ({ cat: c, items: map[c] || [] }));
  }, [menu, categories, search]);

  // Scroll listener: aktive Kategorie bestimmen
  useEffect(() => {
    if (!categories.length) return;
    const handler = () => {
      const toolbarH = (toolbarRef.current?.offsetHeight || 0);
      const y = window.scrollY + toolbarH + 8;
      let bestCat: string | null = null;
      let bestDist = Infinity;
      for (const c of categories) {
        const el = sectionRefs.current[c];
        if (!el) continue;
        const top = el.offsetTop;
        if (y >= top) {
          const d = y - top;
          if (d < bestDist) {
            bestDist = d;
            bestCat = c;
          }
        }
      }
      if (!bestCat && categories[0]) bestCat = categories[0];
      if (bestCat && bestCat !== cat) setCat(bestCat);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [categories, cat]);

  // --- Registration Modal State ---
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regDone, setRegDone] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // --- Login Modal Handler (Server) ---
  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const username = loginUsername.trim();
    const password = loginPassword;
    if (!username || !password) {
      setLoginError("Bitte Benutzername und Passwort eingeben.");
      return;
    }
    try {
      const t = getTenantKey();
      const j = await apiUsersGet(t, true);
      const allowed = j.allowed || ["admin"];
      if (!allowed.includes(username)) {
        setLoginError("Unbekannter Benutzer.");
        return;
      }
      const pwMap = (j.passwords || {}) as Record<string, string>;
      let stored = pwMap[username];
      if (!stored && username === "admin") stored = ADMIN_PASSWORD;
      if (!stored) {
        setLoginError("Kein Passwort gesetzt.");
        return;
      }
      if (password !== stored) {
        setLoginError("Falsches Passwort.");
        return;
      }
      sessionStorage.setItem(ADMIN_TOKEN_KEY, "1");
      sessionStorage.setItem(ADMIN_USER_KEY, username);
      setLoginOpen(false);
      setLoginUsername("");
      setLoginPassword("");
      setLoginError(null);
      window.location.hash = "/admin";
    } catch {
      setLoginError("Login fehlgeschlagen.");
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto p-3 sm:p-4">
          <div className="grid grid-cols-3 items-center">
            {/* left spacer to balance the centered logo */}
            <div className="h-7 sm:h-8" />

            {/* centered logo */}
            <div className="flex items-center justify-center">
              <img src={LOGO_SRC} alt={BRAND_TITLE} className="h-7 sm:h-8 w-auto" />
              <span className="sr-only">{BRAND_TITLE}</span>
            </div>

            {/* right side actions */}
            <div className="flex items-center justify-end">
              <Button
                className="rounded-full border border-neutral-300 px-6 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
                onClick={() => { setLoginOpen(true); setRegisterOpen(false); }}
                pill
              >
                {/* shorter label on small screens to save space */}
                <span className="sm:hidden">Anmelden</span>
                <span className="hidden sm:inline">Anmelden / Registrieren</span>
              </Button>
            </div>
          </div>
        </div>
      </header>
      {/* Login Modal */}
      {loginOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Login</div>
              <Button onClick={() => { setLoginOpen(false); setLoginError(null); }}>Schließen</Button>
            </div>
            <form className="p-4 grid gap-3" onSubmit={handleLoginSubmit}>
              <label className="text-sm">
                <div>Benutzername</div>
                <Input
                  autoFocus
                  value={loginUsername}
                  onChange={e => setLoginUsername(e.target.value)}
                  placeholder="admin"
                />
              </label>
              <label className="text-sm">
                <div>Passwort</div>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Passwort"
                />
              </label>
              {loginError && (
                <div className="text-xs text-red-600">{loginError}</div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" onClick={() => { setLoginOpen(false); setLoginError(null); }}>Abbrechen</Button>
                <PrimaryBtn type="submit">Login</PrimaryBtn>
              </div>
              <div className="text-center text-xs text-neutral-500 pt-2">
                Noch keinen Zugang?{" "}
                <button
                  type="button"
                  className="underline text-amber-700 hover:text-amber-800"
                  onClick={() => { setLoginOpen(false); setRegisterOpen(true); }}
                >
                  Registrieren
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {registerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Zugang beantragen</div>
              <Button onClick={() => setRegisterOpen(false)}>Schließen</Button>
            </div>
            <form
              className="p-4 grid gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (regDone || isSending) return;
                setIsSending(true);
                setRegError(null);
                const u = regUsername.trim();
                const p = regPassword;
                if (!u || !p) { setRegError("Bitte Benutzername und Passwort eingeben."); setIsSending(false); return; }
                if (u.toLowerCase() === "admin") { setRegError("Dieser Benutzername ist reserviert."); setIsSending(false); return; }
                try {
                  await serverRegister(u, p);
                  setRegDone(true);
                } catch (err: any) {
                  const msg = String(err?.message || "");
                  if (msg === "exists") setRegError("Benutzer existiert bereits.");
                  else if (msg === "pending") setRegError("Es liegt bereits eine Anfrage vor.");
                  else if (msg === "invalid") setRegError("Ungültige Eingabe.");
                  else setRegError("Antrag konnte nicht gesendet werden.");
                } finally {
                  setIsSending(false);
                }
              }}
            >
              {!regDone ? (
                <>
                  <label className="text-sm">
                    <div>Benutzername</div>
                    <Input value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="mein-name" disabled={isSending} />
                  </label>
                  <label className="text-sm">
                    <div>Passwort</div>
                    <Input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="Passwort" disabled={isSending} />
                  </label>
                  {regError && <div className="text-xs text-red-600">{regError}</div>}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button type="button" onClick={() => setRegisterOpen(false)} disabled={isSending}>Abbrechen</Button>
                    <PrimaryBtn type="submit" disabled={isSending}>{isSending ? "Senden…" : "Antrag senden"}</PrimaryBtn>
                  </div>
                </>
              ) : (
                <div className="text-sm p-2">
                  Antrag wurde übermittelt. Ein Admin muss die Registrierung freigeben.
                </div>
              )}
            </form>
          </div>
        </div>
      )}
      {searchOpen && (
        <div className="border-b bg-white">
          <div className="max-w-5xl mx-auto p-3">
            <Input
              autoFocus
              placeholder="Suche im Menü..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4">
        {!menu ? (
          <div className="p-4 text-sm text-neutral-500">Lade Menü…</div>
        ) : (
          <>
            {/* Kategorien-Toolbar mit Scroll und Menü */}
            <div
              className="mb-4 -mx-4 px-4 sticky z-40 bg-white/95 backdrop-blur"
              style={{ top: 0 }}
              ref={toolbarRef}
            >
              <div className="flex items-center gap-3">
                {/* Suche öffnen */}
                <button
                  aria-label="Suche"
                  className="inline-flex items-center justify-center rounded-full w-10 h-10 border border-neutral-300 text-neutral-500 bg-transparent hover:text-neutral-700 hover:border-neutral-400"
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  🔍
                </button>
                {/* Hamburger zum Öffnen der Liste */}
                <button
                  aria-label="Kategorien"
                  className="inline-flex items-center justify-center rounded-full w-10 h-10 border border-neutral-300 text-neutral-500 bg-transparent hover:text-neutral-700 hover:border-neutral-400"
                  onClick={() => setNavOpen(true)}
                >
                  ≡
                </button>
                {/* Links scrollen */}
                <button
                  aria-label="Links scrollen"
                  className="inline-flex items-center justify-center text-neutral-500 hover:text-neutral-700 bg-transparent px-2"
                  onClick={() => catRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                >
                  ‹
                </button>
                {/* Scrollbare Kategorienleiste */}
                <div
                  ref={catRef}
                  className="flex gap-2 overflow-x-auto flex-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pl-2"
                >
                  {categories.map((c) => (
                    <button
                      key={c}
                      data-cat={c}
                      onClick={() => { setCat(c); setFilterOn(false); scrollToCategory(c); }}
                      className={
                        "shrink-0 rounded-full px-5 py-2 text-sm bg-transparent transition " +
                        (cat === c
                          ? "border-2 border-amber-500 text-amber-700 font-semibold"
                          : "border-2 border-transparent text-neutral-600 hover:text-neutral-800")
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {/* Rechts scrollen */}
                <button
                  aria-label="Rechts scrollen"
                  className="inline-flex items-center justify-center text-neutral-500 hover:text-neutral-700 bg-transparent px-2"
                  onClick={() => catRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                >
                  ›
                </button>
              </div>
            </div>

            {/* Vollbild-Overlay mit Kategorienliste */}
            {navOpen && (
              <div className="fixed inset-0 z-50">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
                <div className="absolute left-0 right-0 top-0 mx-auto max-w-md bg-white/95 backdrop-blur rounded-b-2xl shadow-xl">
                  <div className="flex items-center justify-between p-4 border-b">
                    <div className="text-lg font-semibold">Kategorien</div>
                    <Button className="rounded-full w-10 h-10" onClick={() => setNavOpen(false)}>×</Button>
                  </div>
                  <div className="p-2 max-h-[70vh] overflow-auto">
                    {categories.map((c) => (
                      <button
                        key={c}
                        className={
                          "w-full text-left px-4 py-3 border-b hover:bg-neutral-50 " +
                          (cat === c ? "bg-neutral-100 font-semibold" : "")
                        }
                        onClick={() => { setCat(c); setFilterOn(false); scrollToCategory(c); setNavOpen(false); }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {grouped.map(({ cat: c, items }, idx) => (
              <section
                key={c}
                data-cat={c}
                ref={(el) => { sectionRefs.current[c] = el; }}
                className={idx === 0 ? 'pt-1' : 'pt-6 mt-6 border-t'}
                id={`sec-${c}`}
              >
                <h2 className="text-xl font-semibold mb-3 px-1">{c}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {items.map((item) => (
                    <Card key={item.id}>
                      <img src={item.img} alt={item.name} className="w-full h-40 object-cover rounded-t-xl" />
                      <CardHeader>
                        <CardTitle>{item.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-neutral-600 mb-2">{item.desc}</p>
                        <div className="font-semibold">€ {item.price.toFixed(2)}</div>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && (
                    <div className="text-sm text-neutral-500">Keine Artikel in dieser Kategorie.</div>
                  )}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      <footer className="text-center py-4 text-sm text-neutral-500 border-t mt-6">
        © {new Date().getFullYear()} QR-Speisekarte Urixsoft
      </footer>
    </div>
  );
}

/* ---------- Admin-Bereich unter /admin ---------- */
function AdminApp() {
  // --- Pending/Users vom Server laden ---
  const [pendingUsers, setPendingUsers] = useState<Record<string,string>>({});
  const [pendingOpen, setPendingOpen] = useState(false);
  const [usersList, setUsersList] = useState<string[]>([]);
  const [usersOpen, setUsersOpen] = useState(false);

  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [cat, setCat] = useState("");
  const [search, setSearch] = useState("");
  const [, setFilterOn] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null);
  const [authed, setAuthed] = useState<boolean>(typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY) === '1');
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem(ADMIN_USER_KEY) || "";
    return "";
  });
  const currentUser = (typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_USER_KEY) : null) || username || "";
  const isSuperAdmin = currentUser === "admin";
  // --- Password Modal State ---
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  // Mobile menu (hamburger) state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // --- Notification State ---
  const [notify, setNotify] = useState<{ msg: string; type?: "info" | "error" | "success" } | null>(null);
  function showNotify(msg: string, type: "info" | "error" | "success" = "info") {
    setNotify({ msg, type });
    setTimeout(() => setNotify(null), 2500);
  }

  // --- Toolbar/Category Scroll State ---
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // --- Drag & Drop state for categories
  const [dragCat, setDragCat] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const catRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // --- Dynamic header height ---
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState<number>(HEADER_H);
  useEffect(() => {
    const measure = () => setHeaderH(headerRef.current?.offsetHeight || HEADER_H);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, []);
  function alignActiveCatLeftAdmin() {
    const container = catRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>(`[data-cat="${CSS.escape(cat)}"]`);
    if (!el) return;
    const pad = 8;
    const target = Math.max(0, el.offsetLeft - container.offsetLeft - pad);
    container.scrollTo({ left: target, behavior: 'smooth' });
  }
  useEffect(() => { alignActiveCatLeftAdmin(); }, [cat]);

  function scrollToCategory(targetCat: string) {
    const el = sectionRefs.current[targetCat];
    if (!el) return;
    const toolbarH = (toolbarRef.current?.offsetHeight || 0) + headerH;
    const y = el.getBoundingClientRect().top + window.scrollY - toolbarH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // --- Autosave Setup (ohne doppeltes ADMIN_SECRET) ---
  const TENANT = getTenantKey();

  const savingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const itemsRef = useRef<MenuItem[] | null>(menu);
  useEffect(() => { itemsRef.current = menu; }, [menu]);

  async function persistNow(payload: MenuItem[] | null) {
    if (!payload) return;
    try {
      savingRef.current = true;
      const r = await fetch("/api/save-menu", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ tenant: TENANT, items: payload })
      });
      if (!r.ok) {
        console.error("Autosave fehlgeschlagen:", await r.text());
      }
    } catch (e) {
      console.error("Autosave Error", e);
    } finally {
      savingRef.current = false;
    }
  }

  function scheduleAutosave() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (!savingRef.current) persistNow(itemsRef.current);
    }, 1500);
  }

  useEffect(() => { document.title = BRAND_TITLE + " – Admin"; }, []);
  useEffect(() => {
    (async () => {
      const j = await apiUsersGet(getTenantKey());
      setUsersList(j.allowed || []);
      setPendingUsers(j.pending || {});
    })();
    const tenant = getTenantKey();
    fetchMenu(tenant).then(setMenu);
  }, []);

  const categories = useMemo(() => Array.from(new Set((menu ?? []).map(i => i.category))), [menu]);

  useEffect(() => {
    if (!menu) return;
    const first = categories[0];
    if (!cat && first) {
      setCat(first);
      setFilterOn(false);
      setTimeout(() => alignActiveCatLeftAdmin(), 80);
    }
  }, [menu, categories]);

  const grouped = useMemo(() => {
    const items = (menu ?? []).filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    const map: Record<string, MenuItem[]> = {};
    for (const c of categories) map[c] = [];
    for (const it of items) {
      (map[it.category] ||= []).push(it);
    }
    return categories.map(c => ({ cat: c, items: map[c] || [] }));
  }, [menu, categories, search]);

  // Scroll listener
  useEffect(() => {
    if (!categories.length) return;
    const handler = () => {
      const toolbarH = (toolbarRef.current?.offsetHeight || 0) + headerH;
      const y = window.scrollY + toolbarH + 8;
      let bestCat: string | null = null;
      let bestDist = Infinity;
      for (const c of categories) {
        const el = sectionRefs.current[c];
        if (!el) continue;
        const top = el.offsetTop;
        if (y >= top) {
          const d = y - top;
          if (d < bestDist) {
            bestDist = d;
            bestCat = c;
          }
        }
      }
      if (!bestCat && categories[0]) bestCat = categories[0];
      if (bestCat && bestCat !== cat) setCat(bestCat);
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [categories, cat, headerH]);

  function addItem() { setEditTarget(null); setEditorOpen(true); }
  function deleteItem(id: string) {
    if (!menu) return;
    if (!confirm("Artikel wirklich löschen?")) return;
    setMenu(menu.filter(i => i.id !== id));
    scheduleAutosave();
  }
  function upsertItem(next: MenuItem) {
    setMenu(prev => {
      const list = prev ?? [];
      const exists = list.some(i => i.id === next.id);
      return exists ? list.map(i => (i.id === next.id ? next : i)) : [next, ...list];
    });
    setEditorOpen(false);
    scheduleAutosave();
  }

  // Kategorie umbenennen
  function renameCategory(oldName: string) {
    const current = oldName;
    const proposed = prompt(`Kategorie umbenennen: "${current}" →`, current);
    const newName = proposed ? proposed.trim() : "";
    if (!newName || newName === current) return;
    setMenu(prev => (prev ?? []).map(i => i.category === current ? { ...i, category: newName } : i));
    if (cat === current) setCat(newName);
    scheduleAutosave();
  }

  // Kategorie löschen
  function deleteCategory(name: string) {
    const list = menu ?? [];
    const count = list.filter(i => i.category === name).length;
    const otherCats = categories.filter(c => c !== name);
    const fallback = otherCats[0] || "Sonstiges";
    let target = fallback;
    if (count > 0) {
      const answer = prompt(`Es gibt ${count} Artikel in "${name}". In welche Kategorie verschieben? (leer = "${fallback}")`, fallback);
      target = (answer && answer.trim()) || fallback;
    }
    setMenu(prev => (prev ?? []).map(i => i.category === name ? { ...i, category: target } : i));
    if (cat === name) setCat(target);
    setFilterOn(true);
    scheduleAutosave();
  }

  // Kategorien-Reihenfolge anpassen
  function reorderMenuByCategories(newOrder: string[]) {
    setMenu(prev => {
      const list = prev ?? [];
      const bucket: Record<string, MenuItem[]> = {};
      for (const it of list) {
        (bucket[it.category] ||= []).push(it);
      }
      const result: MenuItem[] = [];
      for (const c of newOrder) {
        if (bucket[c]) {
          result.push(...bucket[c]);
          delete bucket[c];
        }
      }
      for (const rest of Object.keys(bucket)) {
        result.push(...bucket[rest]);
      }
      return result;
    });
    scheduleAutosave();
  }
  function moveCategoryByDnD(fromCat: string, toCat: string) {
    if (!fromCat || !toCat || fromCat === toCat) return;
    const order = [...categories];
    const from = order.indexOf(fromCat);
    const to = order.indexOf(toCat);
    if (from < 0 || to < 0 || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    reorderMenuByCategories(order);
    setCat(fromCat);
  }

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, '1');
      sessionStorage.setItem(ADMIN_USER_KEY, "admin");
      setUsername("admin");
      setAuthed(true);
    } else {
      alert('Falsches Passwort');
    }
  }

  // Passwort ändern (Server)
  function changePassword() {
    setPasswordModalOpen(true);
  }

  // User management helpers (Server)
  async function resetPasswordFor(targetUser: string) {
    const pw1 = prompt(`Neues Passwort für "${targetUser}" eingeben:`);
    if (!pw1) return;
    const pw2 = prompt("Neues Passwort wiederholen:");
    if (pw1 !== pw2) {
      alert("Passwörter stimmen nicht überein.");
      return;
    }
    try {
      await serverSetPassword(targetUser, pw1);
      showNotify(`"${targetUser}" Passwort geändert.`, "success");
    } catch (err: any) {
      showNotify(`Passwort konnte für "${targetUser}" nicht gesetzt werden.`, "error");
      console.error("[reset-password] failed:", err);
    }
  }

  async function deleteUser(targetUser: string) {
    const currentUser = sessionStorage.getItem(ADMIN_USER_KEY) || username;
    if (targetUser === "admin") { alert("Der Benutzer 'admin' kann nicht gelöscht werden."); return; }
    if (targetUser === currentUser) { alert("Du kannst den aktuell angemeldeten Benutzer nicht löschen."); return; }
    if (!confirm(`Benutzer "${targetUser}" wirklich löschen?`)) return;
    try {
      await serverDeleteUser(targetUser);
      const j = await apiUsersGet(getTenantKey());
      setUsersList(j.allowed || []);
    } catch (err: any) {
      showNotify(`Benutzer "${targetUser}" konnte nicht gelöscht werden.`, "error");
      console.error("[users-delete] failed:", err);
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50 text-neutral-900 p-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-xl border bg-white p-4 grid gap-3">
          <div className="text-lg font-semibold">Admin Login</div>
          <label className="text-sm">
            <div>Passwort</div>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="admin123" />
          </label>
          <PrimaryBtn type="submit">Anmelden</PrimaryBtn>
          <div className="text-xs text-neutral-500">Hinweis: Demo-Login ohne Backend. Passwort in App-Code (ADMIN_PASSWORD) änderbar.</div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-white border-b">
        <div className="max-w-5xl mx-auto w-full p-3 sm:p-4">
          {/* Mobile: centered logo + hamburger on the right */}
          <div className="sm:hidden grid grid-cols-3 items-center">
            <div />
            <div className="flex items-center justify-center">
              <img src={LOGO_SRC} alt={BRAND_TITLE} className="h-7 w-auto" />
              <span className="sr-only">{BRAND_TITLE}</span>
            </div>
            <div className="flex items-center justify-end">
              <Button className="rounded-full w-10 h-10" onClick={() => setMobileMenuOpen(true)}>≡</Button>
            </div>
          </div>

          {/* Desktop: logo left + actions right */}
          <div className="hidden sm:flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src={LOGO_SRC} alt={BRAND_TITLE} className="h-7 sm:h-8 w-auto" />
              <span className="hidden sm:inline text-sm text-neutral-600">– Admin</span>
            </div>
            <div className="flex items-center gap-3">
              {isSuperAdmin && (
                <>
                  <Button
                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
                    onClick={async () => {
                      const j = await apiUsersGet(getTenantKey());
                      setUsersList(j.allowed || []);
                      setUsersOpen(true);
                    }}
                    pill
                  >
                    Benutzer ({usersList.length})
                  </Button>
                  <Button
                    className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
                    onClick={async () => {
                      const j = await apiUsersGet(getTenantKey());
                      setPendingUsers(j.pending || {});
                      setPendingOpen(true);
                    }}
                    pill
                  >
                    Anträge ({Object.keys(pendingUsers || {}).length})
                  </Button>
                </>
              )}
              <span className="text-sm text-neutral-700">
                {sessionStorage.getItem(ADMIN_USER_KEY) || username || "admin"}
              </span>
              <Button
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
                onClick={changePassword}
                pill
              >
                Passwort ändern
              </Button>
              <Button
                className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
                onClick={() => {
                  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                  sessionStorage.removeItem(ADMIN_USER_KEY);
                  setAuthed(false);
                  setUsername("");
                  window.location.hash = "/";
                }}
                pill
              >
                Logout
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile slide-over menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 right-0 top-0 mx-auto max-w-md bg-white/95 backdrop-blur rounded-b-2xl shadow-xl">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="text-lg font-semibold">Menü</div>
                <Button className="rounded-full w-10 h-10" onClick={() => setMobileMenuOpen(false)}>×</Button>
              </div>
              <div className="p-3">
                {isSuperAdmin && (
                  <>
                    <Button
                      pill
                      className="w-full mb-2"
                      onClick={async () => {
                        const j = await apiUsersGet(getTenantKey());
                        setUsersList(j.allowed || []);
                        setUsersOpen(true);
                        setMobileMenuOpen(false);
                      }}
                    >
                      Benutzer ({usersList.length})
                    </Button>
                    <Button
                      pill
                      className="w-full mb-2"
                      onClick={async () => {
                        const j = await apiUsersGet(getTenantKey());
                        setPendingUsers(j.pending || {});
                        setPendingOpen(true);
                        setMobileMenuOpen(false);
                      }}
                    >
                      Anträge ({Object.keys(pendingUsers || {}).length})
                    </Button>
                  </>
                )}
                <Button pill className="w-full mb-2" onClick={() => { setMobileMenuOpen(false); changePassword(); }}>Passwort ändern</Button>
                <Button
                  pill
                  className="w-full"
                  onClick={() => {
                    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                    sessionStorage.removeItem(ADMIN_USER_KEY);
                    setAuthed(false);
                    setUsername("");
                    window.location.hash = "/";
                  }}
                >
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t">
          <div className="max-w-5xl mx-auto p-3 flex flex-wrap items-center gap-2">
            <PrimaryBtn onClick={addItem}>+ Neuer Artikel</PrimaryBtn>
            <span className="text-xs text-neutral-500">Änderungen werden automatisch gespeichert.</span>
          </div>
        </div>
      </header>
      <div style={{ height: headerH }} />
      {searchOpen && (
        <div className="border-b bg-white">
          <div className="max-w-5xl mx-auto p-3">
            <Input
              autoFocus
              placeholder="Suche im Menü..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4">
        {!menu ? (
          <div className="p-4 text-sm text-neutral-500">Lade Menü…</div>
        ) : (
          <>
            {/* Kategorien-Toolbar (Admin) */}
            <div
              className="mb-4 -mx-4 px-4 sticky z-40 bg-white/95 backdrop-blur"
              style={{ top: headerH }}
              ref={toolbarRef}
            >
              <div className="flex items-center gap-3">
                {/* Suche öffnen */}
                <button
                  aria-label="Suche"
                  className="inline-flex items-center justify-center rounded-full w-10 h-10 border border-neutral-300 text-neutral-500 bg-transparent hover:text-neutral-700 hover:border-neutral-400"
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  🔍
                </button>
                {/* Hamburger */}
                <button
                  aria-label="Kategorien"
                  className="inline-flex items-center justify-center rounded-full w-10 h-10 border border-neutral-300 text-neutral-500 bg-transparent hover:text-neutral-700 hover:border-neutral-400"
                  onClick={() => setNavOpen(true)}
                >
                  ≡
                </button>
                {/* Links scrollen */}
                <button
                  aria-label="Links scrollen"
                  className="inline-flex items-center justify-center text-neutral-500 hover:text-neutral-700 bg-transparent px-2"
                  onClick={() => catRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
                >
                  ‹
                </button>
                {/* Scrollbare Leiste */}
                <div
                  ref={catRef}
                  className="flex gap-2 overflow-x-auto flex-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pl-2"
                >
                  {categories.map((c) => (
                    <button
                      key={c}
                      data-cat={c}
                      onClick={() => { setCat(c); setFilterOn(false); scrollToCategory(c); }}
                      className={
                        "shrink-0 rounded-full px-5 py-2 text-sm bg-transparent transition " +
                        (cat === c
                          ? "border-2 border-amber-500 text-amber-700 font-semibold"
                          : "border-2 border-transparent text-neutral-600 hover:text-neutral-800")
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {/* Rechts scrollen */}
                <button
                  aria-label="Rechts scrollen"
                  className="inline-flex items-center justify-center text-neutral-500 hover:text-neutral-700 bg-transparent px-2"
                  onClick={() => catRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
                >
                  ›
                </button>
              </div>
            </div>

            {navOpen && (
              <div className="fixed inset-0 z-50">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
                <div className="absolute left-0 right-0 top-0 mx-auto max-w-md bg-white/95 backdrop-blur rounded-b-2xl shadow-xl">
                  <div className="flex items-center justify-between p-4 border-b">
                    <div className="text-lg font-semibold">Kategorien</div>
                    <Button className="rounded-full w-10 h-10" onClick={() => setNavOpen(false)}>×</Button>
                  </div>
                  <div className="p-2 max-h-[70vh] overflow-auto">
                    {categories.map((c) => (
                      <div
                        key={c}
                        draggable
                        onDragStart={(e) => {
                          setDragCat(c);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", c);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverCat !== c) setDragOverCat(c);
                        }}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          if (dragOverCat !== c) setDragOverCat(c);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = dragCat;
                          setDragCat(null);
                          setDragOverCat(null);
                          if (from) moveCategoryByDnD(from, c);
                        }}
                        onDragEnd={() => {
                          setDragCat(null);
                          setDragOverCat(null);
                        }}
                        className={
                          "w-full px-4 py-3 border-b flex items-center justify-between cursor-grab active:cursor-grabbing " +
                          (cat === c ? "bg-neutral-100 " : "hover:bg-neutral-50 ") +
                          (dragOverCat === c ? "ring-2 ring-amber-400 ring-offset-0" : "")
                        }
                        title="Zum Verschieben ziehen"
                      >
                        <div
                          className={"text-left flex-1 flex items-center gap-3 " + (cat === c ? "font-semibold" : "")}
                          onClick={() => { setCat(c); setFilterOn(false); scrollToCategory(c); setNavOpen(false); }}
                        >
                          <span className="text-neutral-400 select-none">⋮⋮</span>
                          <span>{c}</span>
                        </div>
                        <div className="ml-3 flex items-center gap-2">
                          <button
                            className="text-xs px-2 py-1 border rounded-full text-neutral-600 hover:text-neutral-800 hover:border-neutral-400"
                            onClick={(e) => { e.stopPropagation(); renameCategory(c); }}
                            title="Kategorie umbenennen"
                          >
                            Umbenennen
                          </button>
                          <button
                            className="text-xs px-2 py-1 border rounded-full text-red-600 hover:text-red-700 hover:border-red-300"
                            onClick={(e) => { e.stopPropagation(); deleteCategory(c); }}
                            title="Kategorie löschen"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {grouped.map(({ cat: c, items }, idx) => (
              <section
                key={c}
                data-cat={c}
                ref={(el) => { sectionRefs.current[c] = el; }}
                className={idx === 0 ? 'pt-1' : 'pt-6 mt-6 border-t'}
                id={`sec-${c}`}
              >
                <h2 className="text-xl font-semibold mb-3 px-1">{c}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {items.map((item) => (
                    <Card key={item.id}>
                      <img src={item.img} alt={item.name} className="w-full h-40 object-cover rounded-t-xl" />
                      <CardHeader>
                        <CardTitle>{item.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-neutral-600 mb-2">{item.desc}</p>
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">€ {item.price.toFixed(2)}</div>
                          <div className="flex items-center gap-2">
                            <Button onClick={() => { setEditTarget(item); setEditorOpen(true); }}>Bearbeiten</Button>
                            <Button onClick={() => deleteItem(item.id)}>Löschen</Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>

      <footer className="text-center py-4 text-sm text-neutral-500 border-t mt-6">
        © {new Date().getFullYear()} QR-Speisekarte Urixsoft
      </footer>

      {/* Anträge modal */}
      {isSuperAdmin && pendingOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Ausstehende Zugänge</div>
              <Button onClick={() => setPendingOpen(false)}>Schließen</Button>
            </div>
            <div className="p-2 max-h-[70vh] overflow-auto">
              {Object.keys(pendingUsers).length === 0 ? (
                <div className="p-3 text-sm text-neutral-500">Keine Anträge vorhanden.</div>
              ) : (
                Object.entries(pendingUsers).map(([u]) => (
                  <div key={u} className="flex items-center justify-between border-b px-3 py-2">
                    <div className="font-medium">{u}</div>
                    <div className="flex items-center gap-2">
                      <Button
                        className="rounded-full px-3 py-1 text-sm"
                        onClick={async () => {
                          try {
                            // Optimistic UI: sofort aus der Pending-Liste entfernen
                            setPendingUsers(prev => {
                              const next = { ...prev };
                              delete next[u];
                              return next;
                            });

                            // Benutzer sofort lokal hinzufügen
                            setUsersList(prev => [...prev, u]);

                            // Server-Update
                            await serverApprove(u);

                            // Optional: Backend neu laden, um sicherzustellen, dass alles synchron ist
                            const j = await apiUsersGet(getTenantKey());
                            setUsersList(j.allowed || []);

                            showNotify(`"${u}" freigegeben.`, "success");
                          } catch (e: any) {
                            console.error(e);
                            showNotify("Freigeben fehlgeschlagen: " + (e?.message || e), "error");
                          }
                        }}
                        pill
                      >
                        Freigeben
                      </Button>
                      <Button
                        className="rounded-full px-3 py-1 text-sm text-red-600 border-red-300 hover:bg-red-50"
                        onClick={async () => {
                          try {
                            // Optimistic UI: remove from local pending list immediately
                            setPendingUsers(prev => {
                              const next = { ...prev };
                              delete next[u];
                              return next;
                            });

                            await serverReject(u);

                            showNotify(`"${u}" abgelehnt.`, "success");
                          } catch (e: any) {
                            console.error(e);
                            showNotify("Ablehnen fehlgeschlagen: " + (e?.message || e), "error");
                          }
                        }}
                        pill
                      >
                        Ablehnen
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Passwort ändern Modal */}
      {isSuperAdmin && passwordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl p-5">
            <div className="font-semibold text-lg mb-3">Passwort ändern</div>
            <label className="text-sm block mb-2">
              Neues Passwort
              <Input
                type="password"
                className="mt-1"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <label className="text-sm block mb-2">
              Passwort bestätigen
              <Input
                type="password"
                className="mt-1"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            {pwError && <div className="text-xs text-red-600 mb-2">{pwError}</div>}
            <div className="flex items-center justify-end gap-2 pt-3">
              <Button onClick={() => setPasswordModalOpen(false)}>Abbrechen</Button>
              <PrimaryBtn
                disabled={!newPw || !confirmPw}
                onClick={async () => {
                  if (newPw !== confirmPw) {
                    setPwError("Passwörter stimmen nicht überein.");
                    return;
                  }
                  try {
                    const currentUser = sessionStorage.getItem(ADMIN_USER_KEY) || username;
                    await serverSetPassword(currentUser, newPw);
                    showNotify("Passwort erfolgreich geändert.", "success");
                    setPasswordModalOpen(false);
                    setNewPw("");
                    setConfirmPw("");
                    setPwError(null);
                  } catch (err: any) {
                    setPwError("Fehler: " + (err?.message || "unbekannt"));
                  }
                }}
              >
                Speichern
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <Editor
        open={editorOpen}
        item={editTarget}
        menu={menu}
        onClose={() => setEditorOpen(false)}
        onSave={(draft) => {
          if (!draft.id) draft.id = Math.random().toString(36).slice(2,9);
          upsertItem(draft);
        }}
      />
      {/* Notification */}
      {notify && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all duration-300 ${
            notify.type === "error"
              ? "bg-red-600"
              : notify.type === "success"
              ? "bg-green-600"
              : "bg-neutral-700"
          }`}
          style={{ zIndex: 9999 }}
        >
          {notify.msg}
        </div>
      )}
    </div>
  );
}

/* ---------- sehr einfacher Router: /admin -> AdminApp, sonst Public ---------- */
export default function App() {
  const [route, setRoute] = React.useState<string>(() => {
    if (typeof window === "undefined") return "/";
    return window.location.hash?.slice(1) || "/";
  });

  React.useEffect(() => {
    const onHash = () => setRoute(window.location.hash?.slice(1) || "/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route.startsWith("/admin")) return <AdminApp />;
  return <PublicApp />;
}