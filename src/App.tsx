import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- kleine UI-Helpers (Tailwind) ---------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string };
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { className?: string };
type DivProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };

const Button: React.FC<ButtonProps> = ({ className = "", ...props }) => (
  <button
    className={("inline-flex items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-50 " + className).trim()}
    {...props}
  />
);
const PrimaryBtn: React.FC<ButtonProps> = ({ className = "", ...props }) => (
  <button
    className={("inline-flex items-center justify-center gap-2 rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90 active:opacity-80 disabled:opacity-50 " + className).trim()}
    {...props}
  />
);
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
const ALLOWED_USERS = ["admin"];
const PASSWORDS_KEY = "qrmenu.passwords";
// -------- Passwort-Storage-Helpers --------
function loadPasswords(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    return parsed;
  } catch {
    return {};
  }
}
function savePasswords(map: Record<string, string>) {
  localStorage.setItem(PASSWORDS_KEY, JSON.stringify(map));
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

  const existingCats = useMemo(() => Array.from(new Set((menu ?? []).map(i => i.category))), [menu]);
  const NEW = "__NEW_CATEGORY__";

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
                  // Speichere Base64-DataURL direkt ins img-Feld
                  setDraft({ ...draft, img: String(reader.result) });
                };
                reader.readAsDataURL(file);
              }}
            />
            <div className="text-xs text-neutral-500 mt-1">Tipp: Du kannst entweder eine Bild-URL angeben oder eine Datei auswählen. Beim Upload wird das Bild als Base64 gespeichert.</div>
          </label>
          <label className="text-sm">
            <div>Kategorie</div>
            <select
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={existingCats.includes(draft.category) ? draft.category : NEW}
              onChange={(e) => {
                const v = e.target.value;
                if (v === NEW) {
                  // Umschalten auf Eingabe einer neuen Kategorie
                  setDraft({ ...draft, category: "" });
                } else {
                  setDraft({ ...draft, category: v });
                }
              }}
            >
              {existingCats.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value={NEW}>+ Neue Kategorie hinzufügen</option>
            </select>
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
    const pad = 8; // small left padding so it doesn't touch the edge
    const target = Math.max(0, el.offsetLeft - container.offsetLeft - pad);
    container.scrollTo({ left: target, behavior: 'smooth' });
  }
  useEffect(() => { alignActiveCatLeft(); }, [cat]);

  function scrollToCategory(targetCat: string) {
    const el = sectionRefs.current[targetCat];
    if (!el) return;
    const toolbarH = (toolbarRef.current?.offsetHeight || 0); // only toolbar height
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
      // wichtig: initial kein Filter aktiv
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

  // Scroll listener: bestimmt die aktive Kategorie exakt an der "oberen Kante"
  useEffect(() => {
    if (!categories.length) return;
    const handler = () => {
      const toolbarH = (toolbarRef.current?.offsetHeight || 0); // only toolbar height (header scrolls away)
      const y = window.scrollY + toolbarH + 8; // Referenzlinie knapp unter der Toolbar
      let bestCat: string | null = null;
      let bestDist = Infinity;
      for (const c of categories) {
        const el = sectionRefs.current[c];
        if (!el) continue;
        const top = el.offsetTop; // absoluter Abstand vom Dokumentanfang
        if (y >= top) {
          const d = y - top;
          if (d < bestDist) {
            bestDist = d;
            bestCat = c;
          }
        }
      }
      // Falls wir oberhalb der ersten Sektion sind, nimm die erste
      if (!bestCat && categories[0]) bestCat = categories[0];
      if (bestCat && bestCat !== cat) setCat(bestCat);
    };
    window.addEventListener('scroll', handler, { passive: true });
    // Initial ausführen, damit beim Laden sofort die korrekte Kategorie aktiv ist
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [categories, cat]);

  // --- Login Modal Handler ---
  function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    const username = loginUsername.trim();
    const password = loginPassword;
    if (!username || !password) {
      setLoginError("Bitte Benutzername und Passwort eingeben.");
      return;
    }
    if (!ALLOWED_USERS.includes(username)) {
      setLoginError("Unbekannter Benutzer.");
      return;
    }
    const map = loadPasswords();
    let stored = map[username];
    if (!stored && username === "admin") stored = ADMIN_PASSWORD;
    if (!stored) {
      setLoginError("Kein Passwort gesetzt.");
      return;
    }
    if (password !== stored) {
      setLoginError("Falsches Passwort.");
      return;
    }
    // Success: set session, close modal, redirect
    sessionStorage.setItem(ADMIN_TOKEN_KEY, "1");
    sessionStorage.setItem(ADMIN_USER_KEY, username);
    setLoginOpen(false);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError(null);
    window.location.hash = "/admin";
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto relative p-3 sm:p-4">
          {/* Centered logo */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img src={LOGO_SRC} alt={BRAND_TITLE} className="h-7 sm:h-8 w-auto pointer-events-auto" />
            <span className="sr-only">{BRAND_TITLE}</span>
          </div>
          {/* Right side actions */}
          <div className="flex items-center justify-end">
            <Button
              className="rounded-full border border-neutral-300 px-6 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
              onClick={() => setLoginOpen(true)}
            >
              Anmelden
            </Button>
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

            {/* Vollbild-Overlay mit Kategorienliste (ähnlich dem Screenshot) */}
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
  // --- Toolbar/Category Scroll State ---
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const catRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const toolbarRef = useRef<HTMLDivElement | null>(null);
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
    const toolbarH = (toolbarRef.current?.offsetHeight || 0) + HEADER_H;
    const y = el.getBoundingClientRect().top + window.scrollY - toolbarH - 8;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // --- Autosave Setup ---
  const ADMIN_SECRET = (import.meta as any).env.VITE_ADMIN_SECRET || "";
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

  // Scroll listener: bestimmt die aktive Kategorie exakt an der "oberen Kante"
  useEffect(() => {
    if (!categories.length) return;
    const handler = () => {
      const toolbarH = (toolbarRef.current?.offsetHeight || 0) + HEADER_H; // sticky header + Toolbar (fixed)
      const y = window.scrollY + toolbarH + 8; // Referenzlinie knapp unter der Toolbar
      let bestCat: string | null = null;
      let bestDist = Infinity;
      for (const c of categories) {
        const el = sectionRefs.current[c];
        if (!el) continue;
        const top = el.offsetTop; // absoluter Abstand vom Dokumentanfang
        if (y >= top) {
          const d = y - top;
          if (d < bestDist) {
            bestDist = d;
            bestCat = c;
          }
        }
      }
      // Falls wir oberhalb der ersten Sektion sind, nimm die erste
      if (!bestCat && categories[0]) bestCat = categories[0];
      if (bestCat && bestCat !== cat) setCat(bestCat);
    };
    window.addEventListener('scroll', handler, { passive: true });
    // Initial ausführen, damit beim Laden sofort die korrekte Kategorie aktiv ist
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, [categories, cat]);

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
    // Wenn die aktuell ausgewählte Kategorie betroffen ist, umschalten
    if (cat === current) setCat(newName);
    scheduleAutosave();
  }

  // Kategorie löschen
  function deleteCategory(name: string) {
    const list = menu ?? [];
    const count = list.filter(i => i.category === name).length;
    // Ziel-Kategorie ermitteln/abfragen
    const otherCats = categories.filter(c => c !== name);
    const fallback = otherCats[0] || "Sonstiges";
    let target = fallback;
    if (count > 0) {
      const answer = prompt(`Es gibt ${count} Artikel in "${name}". In welche Kategorie verschieben? (leer = "${fallback}")`, fallback);
      target = (answer && answer.trim()) || fallback;
    }
    // Artikel verschieben
    setMenu(prev => (prev ?? []).map(i => i.category === name ? { ...i, category: target } : i));
    // Auswahl aktualisieren
    if (cat === name) setCat(target);
    setFilterOn(true);
    scheduleAutosave();
  }


  function login(e: React.FormEvent) {
    e.preventDefault();
    // For legacy: allow admin login via direct password entry (no username)
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, '1');
      sessionStorage.setItem(ADMIN_USER_KEY, "admin");
      setUsername("admin");
      setAuthed(true);
    } else {
      alert('Falsches Passwort');
    }
  }
  function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_USER_KEY);
    setAuthed(false);
    setUsername("");
    window.location.hash = "/";
  }

  // Change password for current user
  function changePassword() {
    const currentUser = sessionStorage.getItem(ADMIN_USER_KEY) || username;
    if (!currentUser) {
      alert("Kein Benutzer angemeldet.");
      return;
    }
    const pw1 = prompt("Neues Passwort eingeben:");
    if (!pw1) return;
    const pw2 = prompt("Neues Passwort wiederholen:");
    if (pw1 !== pw2) {
      alert("Passwörter stimmen nicht überein.");
      return;
    }
    const map = loadPasswords();
    map[currentUser] = pw1;
    savePasswords(map);
    alert("Passwort erfolgreich geändert.");
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b">
        <div className="max-w-5xl mx-auto flex justify-between items-center p-4">
          <div className="flex items-center gap-3">
            <img src={LOGO_SRC} alt={BRAND_TITLE} className="h-7 sm:h-8 w-auto" />
            <span className="text-sm text-neutral-600">– Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-700">
              {sessionStorage.getItem(ADMIN_USER_KEY) || username || "admin"}
            </span>
            <Button
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
              onClick={changePassword}
            >
              Passwort ändern
            </Button>
            <Button
              className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 active:bg-neutral-200"
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </div>
        <div className="border-t">
          <div className="max-w-5xl mx-auto p-3 flex flex-wrap items-center gap-2">
            <PrimaryBtn onClick={addItem}>+ Neuer Artikel</PrimaryBtn>
            {/* 
            <Button onClick={() => {
              const blob = new Blob([JSON.stringify(menu ?? [], null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "menu-export.json"; a.click(); URL.revokeObjectURL(url);
            }}>Export JSON</Button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={(ev) => {
                const file = ev.target.files?.[0];
                if (!file) return; const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(String(reader.result));
                    if (!Array.isArray(parsed)) throw new Error("Format ungültig");
                    setMenu(parsed);
                    alert("Import erfolgreich. Nicht vergessen: Speichern (Deploy) klicken.");
                  } catch (e:any) { alert("Konnte Datei nicht importieren: " + e.message); }
                  finally { ev.target.value = ""; }
                };
                reader.readAsText(file);
              }} />
              <span className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm">Import JSON</span>
            </label>
            */}
            <span className="text-xs text-neutral-500">Änderungen werden automatisch gespeichert.</span>
          </div>
        </div>
      </header>
      <div style={{ height: HEADER_H }} />
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
              style={{ top: HEADER_H }}
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
                        className={
                          "w-full px-4 py-3 border-b hover:bg-neutral-50 flex items-center justify-between " +
                          (cat === c ? "bg-neutral-100" : "")
                        }
                      >
                        <button
                          className={"text-left flex-1 " + (cat === c ? "font-semibold" : "")}
                          onClick={() => { setCat(c); setFilterOn(false); scrollToCategory(c); setNavOpen(false); }}
                        >
                          {c}
                        </button>
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
    </div>
  );
}

/* ---------- sehr einfacher Router: /admin -> AdminApp, sonst Public ---------- */
export default function App() {
  // Simple reactive hash router (#/admin etc.)
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