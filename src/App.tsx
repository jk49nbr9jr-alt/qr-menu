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
const ADMIN_TOKEN_KEY = "qrmenu.admin.token";
const ADMIN_PASSWORD = "admin123"; // Demo-Passwort – später ersetzen

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
  const [cat, setCat] = useState("Alle");
  const [search, setSearch] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { document.title = BRAND_TITLE; }, []);
  useEffect(() => {
    const tenant = getTenantKey();
    fetchMenu(tenant).then(setMenu);
  }, []);

  const categories = useMemo(() => ["Alle", ...Array.from(new Set((menu ?? []).map(i => i.category)))], [menu]);
  const filtered = useMemo(() => {
    let items = menu ?? [];
    if (cat !== "Alle") items = items.filter(i => i.category === cat);
    if (search.trim()) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [menu, cat, search]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 bg-white border-b">
        <div className="max-w-5xl mx-auto flex justify-between items-center p-4">
          <h1 className="text-xl font-bold">{BRAND_TITLE}</h1>
          <div className="flex items-center gap-2">
            <Button className="md:hidden" onClick={() => setNavOpen(true)}>Kategorien</Button>
            <Input placeholder="Suche im Menü..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
        {!menu ? (
          <div className="p-4 text-sm text-neutral-500">Lade Menü…</div>
        ) : (
          <>
            {/* Desktop/Tablet: feste Sidebar links */}
            <div className="flex gap-6">
              <aside className="w-48 shrink-0 hidden md:block">
                <div className="sticky top-20">
                  <div className="text-sm font-semibold mb-2">Kategorien</div>
                  <div className="grid gap-2">
                    {categories.map((c) => (
                      <Button key={c} onClick={() => setCat(c)} className={"justify-start " + (cat === c ? "bg-black text-white" : "")}> 
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="flex-1">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filtered.map((item) => (
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
                  {filtered.length === 0 && (
                    <div className="text-sm text-neutral-500">Keine Artikel gefunden.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile: Off-Canvas Sidebar */}
            {navOpen && (
              <div className="fixed inset-0 z-40">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
                <div className="absolute left-0 top-0 h-full w-72 bg-white p-4 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold">Kategorien</div>
                    <Button onClick={() => setNavOpen(false)}>Schließen</Button>
                  </div>
                  <div className="grid gap-2">
                    {categories.map((c) => (
                      <Button
                        key={c}
                        className={"justify-start " + (cat === c ? "bg-black text-white" : "")}
                        onClick={() => { setCat(c); setNavOpen(false); }}
                      >
                        {c}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
  const [cat, setCat] = useState("Alle");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null);
  const [authed, setAuthed] = useState<boolean>(typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY) === '1');
  const [password, setPassword] = useState("");

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

  const categories = useMemo(() => ["Alle", ...Array.from(new Set((menu ?? []).map(i => i.category)))], [menu]);
  const filtered = useMemo(() => {
    let items = menu ?? [];
    if (cat !== "Alle") items = items.filter(i => i.category === cat);
    if (search.trim()) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [menu, cat, search]);

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


  function login(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, '1');
      setAuthed(true);
    } else {
      alert('Falsches Passwort');
    }
  }
  function logout() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setAuthed(false);
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
      <header className="sticky top-0 bg-white border-b">
        <div className="max-w-5xl mx-auto flex justify-between items-center p-4">
          <h1 className="text-xl font-bold">{BRAND_TITLE} – Admin</h1>
          <div className="flex items-center gap-2">
            <Input placeholder="Suche im Menü..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button onClick={logout}>Logout</Button>
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

      <main className="max-w-5xl mx-auto p-4">
        {!menu ? (
          <div className="p-4 text-sm text-neutral-500">Lade Menü…</div>
        ) : (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {categories.map((c) => (
                <Button key={c} onClick={() => setCat(c)} className={cat === c ? "bg-black text-white" : ""}>
                  {c}
                </Button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((item) => (
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
              {filtered.length === 0 && (
                <div className="text-sm text-neutral-500">Noch keine Artikel. Mit “+ Neuer Artikel” beginnen.</div>
              )}
            </div>
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
  // Hash-Routing: /#/admin statt /admin
  const path =
    typeof window !== "undefined"
      ? (window.location.hash?.slice(1) || "/")
      : "/";

  if (path.startsWith("/admin")) return <AdminApp />;
  return <PublicApp />;
}