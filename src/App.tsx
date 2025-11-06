import React, { useEffect, useMemo, useState } from "react";

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

const DEFAULT_MENU: MenuItem[] = [
  { id: "1", name: "Classic Burger", desc: "Rindfleisch-Patty, Cheddar, Tomate, Haus-Sauce", price: 10.9, img: "https://images.unsplash.com/photo-1550317138-10000687a72b?q=80&w=1200&auto=format&fit=crop", category: "Burger" },
  { id: "2", name: "Vegan Burger", desc: "Erbsen-Patty, Avocado, Rucola, vegane Mayo", price: 11.9, img: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?q=80&w=1200&auto=format&fit=crop", category: "Burger" },
  { id: "3", name: "Margherita", desc: "San Marzano, Fior di Latte, Basilikum", price: 9.5, img: "https://images.unsplash.com/photo-1702716059239-385baacdabdc?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1287", category: "Pizza" },
  { id: "4", name: "Espresso", desc: "Single Shot", price: 2.2, img: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?q=80&w=1200&auto=format&fit=crop", category: "Drinks" },
];

const STORAGE_KEY = "qrmenu.menu.v1";
const BRAND_TITLE = "Speisekarte Urixsoft";
const ADMIN_TOKEN_KEY = "qrmenu.admin.token";
const ADMIN_PASSWORD = "admin123"; // TODO: später über .env oder Backend lösen

/* ---------- Hilfsfunktionen ---------- */
function loadMenu(): MenuItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MENU;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_MENU;
    return parsed;
  } catch {
    return DEFAULT_MENU;
  }
}
function saveMenu(items: MenuItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* ---------- Admin Editor ---------- */
type EditorProps = {
  open: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onSave: (next: MenuItem) => void;
};
const Editor: React.FC<EditorProps> = ({ open, item, onClose, onSave }) => {
  const [draft, setDraft] = useState<MenuItem>(item || { id: uid(), name: "", desc: "", price: 0, img: "", category: "Burger" });

  useEffect(() => {
    setDraft(item || { id: uid(), name: "", desc: "", price: 0, img: "", category: "Burger" });
  }, [item, open]);

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
            <div>Kategorie</div>
            <Input placeholder="z. B. Burger, Pizza, Drinks" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} />
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
  const [menu] = useState<MenuItem[]>(loadMenu());
  const [cat, setCat] = useState("Alle");
  const [search, setSearch] = useState("");

  useEffect(() => { document.title = BRAND_TITLE; }, []);

  const categories = useMemo(() => ["Alle", ...Array.from(new Set(menu.map(i => i.category)))], [menu]);
  const filtered = useMemo(() => {
    let items = menu;
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
            <Input placeholder="Suche im Menü..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
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
                <div className="font-semibold">€ {item.price.toFixed(2)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="text-center py-4 text-sm text-neutral-500 border-t mt-6">
        © {new Date().getFullYear()} QR-Speisekarte Urixsof
      </footer>
    </div>
  );
}

/* ---------- Admin-Bereich unter /admin ---------- */
function AdminApp() {
  const [menu, setMenu] = useState<MenuItem[]>(loadMenu());
  const [cat, setCat] = useState("Alle");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItem | null>(null);
  const [authed, setAuthed] = useState<boolean>(typeof window !== 'undefined' && sessionStorage.getItem(ADMIN_TOKEN_KEY) === '1');
  const [password, setPassword] = useState("");

  useEffect(() => { document.title = BRAND_TITLE + " – Admin"; }, []);
  useEffect(() => { saveMenu(menu); }, [menu]);

  const categories = useMemo(() => ["Alle", ...Array.from(new Set(menu.map(i => i.category)))], [menu]);
  const filtered = useMemo(() => {
    let items = menu;
    if (cat !== "Alle") items = items.filter(i => i.category === cat);
    if (search.trim()) items = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [menu, cat, search]);

  function addItem() { setEditTarget(null); setEditorOpen(true); }
  function editItem(it: MenuItem) { setEditTarget(it); setEditorOpen(true); }
  function deleteItem(id: string) { if (!confirm("Artikel wirklich löschen?")) return; setMenu(prev => prev.filter(i => i.id !== id)); }
  function upsertItem(next: MenuItem) {
    setMenu(prev => {
      const exists = prev.some(i => i.id === next.id);
      return exists ? prev.map(i => (i.id === next.id ? next : i)) : [next, ...prev];
    });
    setEditorOpen(false);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(menu, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "menu-export.json"; a.click(); URL.revokeObjectURL(url);
  }
  function importJson(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("Format ungültig");
        setMenu(parsed);
        alert("Import erfolgreich.");
      } catch (e: any) {
        alert("Konnte Datei nicht importieren: " + e.message);
      } finally {
        ev.target.value = "";
      }
    };
    reader.readAsText(file);
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
            <Button onClick={exportJson}>Export JSON</Button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={importJson} />
              <span className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm">Import JSON</span>
            </label>
            <span className="text-xs text-neutral-500">Änderungen werden automatisch lokal gespeichert.</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4">
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
                    <Button onClick={() => editItem(item)}>Bearbeiten</Button>
                    <Button onClick={() => deleteItem(item.id)}>Löschen</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="text-center py-4 text-sm text-neutral-500 border-t mt-6">
        © {new Date().getFullYear()} QR-Speisekarte Urixsoft
      </footer>

      <Editor open={editorOpen} item={editTarget} onClose={() => setEditorOpen(false)} onSave={upsertItem} />
    </div>
  );
}

/* ---------- sehr einfacher Router: /admin -> AdminApp, sonst Public ---------- */
export default function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  if (path.startsWith('/admin')) return <AdminApp />;
  return <PublicApp />;
}