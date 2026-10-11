declare const CONFIG: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
declare const supabase: any;

type Row = { id: string; [k: string]: any };
type FieldType = "text" | "number" | "select" | "date" | "textarea" | "url" | "checkbox" | "photos";
interface Field { key: string; label: string; type: FieldType; options?: string[]; money?: boolean; required?: boolean }
interface Entity {
  id: string; table: string; title: string; singular: string; intro: string;
  fields: Field[]; columns: string[]; match?: (r: Row) => boolean; fixed?: Record<string, any>;
  summary?: (rows: Row[]) => string;
}
interface Store {
  list(t: string): Promise<Row[]>;
  save(t: string, r: Partial<Row>): Promise<void>;
  remove(t: string, id: string): Promise<void>;
}

const main = document.getElementById("main")!;
const nav = document.getElementById("nav")!;
const dlg = document.getElementById("dlg") as HTMLDialogElement;
const form = document.getElementById("form") as HTMLFormElement;

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const brl = (n: number) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

function toast(msg: string) {
  const t = document.getElementById("toast")!;
  t.textContent = msg; t.classList.add("on");
  setTimeout(() => t.classList.remove("on"), 2800);
}

// ---------- Armazenamento: Supabase se config.js estiver preenchido, senão localStorage ----------
const cloud = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined");
const sb = cloud ? supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;
const readLocal = (t: string): Row[] => JSON.parse(localStorage.getItem("casamento:" + t) || "[]");

const store: Store = cloud ? {
  async list(t) { const { data, error } = await sb.from(t).select("*").order("created_at"); if (error) throw error; return data; },
  async save(t, r) { const { error } = await sb.from(t).upsert(r); if (error) throw error; },
  async remove(t, id) { const { error } = await sb.from(t).delete().eq("id", id); if (error) throw error; }
} : {
  async list(t) { return readLocal(t); },
  async save(t, r) {
    const rows = readLocal(t);
    const i = rows.findIndex(x => x.id === r.id);
    if (i >= 0) rows[i] = { ...rows[i], ...r } as Row;
    else rows.push({ ...r, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Row);
    localStorage.setItem("casamento:" + t, JSON.stringify(rows));
  },
  async remove(t, id) { localStorage.setItem("casamento:" + t, JSON.stringify(readLocal(t).filter(x => x.id !== id))); }
};

// ---------- Definição das seções ----------
const VSTATUS = ["Pesquisando", "Orçamento pedido", "Contratado", "Descartado"];
const vendorFields = (cat?: string[]): Field[] => [
  ...(cat ? [{ key: "category", label: "Categoria", type: "select", options: cat, required: true } as Field] : []),
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "price", label: "Valor (R$)", type: "number", money: true },
  { key: "contact", label: "Telefone / e-mail", type: "text" },
  { key: "instagram", label: "Instagram", type: "text" },
  { key: "url", label: "Site / portfólio", type: "url" },
  { key: "status", label: "Situação", type: "select", options: VSTATUS },
  { key: "notes", label: "Observações", type: "textarea" }
];
const OTHER_CATS = ["Buffet", "Música / DJ", "Bolo e doces", "Convites", "Vestido / terno", "Transporte", "Outro"];

const entities: Entity[] = [
  { id: "convidados", table: "guests", title: "Convidados", singular: "convidado", intro: "Quem vem, de que lado e quantos acompanhantes.",
    fields: [
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "side", label: "Lado", type: "select", options: ["Noiva", "Noivo", "Ambos"] },
      { key: "group_name", label: "Grupo (família, trabalho…)", type: "text" },
      { key: "companions", label: "Acompanhantes", type: "number" },
      { key: "phone", label: "Telefone", type: "text" },
      { key: "rsvp", label: "Confirmação", type: "select", options: ["Pendente", "Confirmado", "Recusou"] },
      { key: "notes", label: "Restrições / observações", type: "textarea" }
    ],
    columns: ["name", "side", "group_name", "companions", "rsvp"],
    summary: r => {
      const n = (s: string) => r.filter(x => x.rsvp === s).reduce((a, x) => a + 1 + (Number(x.companions) || 0), 0);
      return `${n("Confirmado")} pessoas confirmadas · ${n("Pendente")} pendentes · ${n("Recusou")} recusaram`;
    } },
  { id: "locais", table: "venues", title: "Locais da festa", singular: "local", intro: "Espaços que você está considerando.",
    fields: [
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "city", label: "Cidade / bairro", type: "text" },
      { key: "capacity", label: "Capacidade", type: "number" },
      { key: "price", label: "Valor (R$)", type: "number", money: true },
      { key: "contact", label: "Telefone / e-mail", type: "text" },
      { key: "url", label: "Site", type: "url" },
      { key: "photos", label: "Fotos do local", type: "photos" },
      { key: "status", label: "Situação", type: "select", options: ["Pesquisando", "Visita marcada", "Visitado", "Contratado", "Descartado"] },
      { key: "notes", label: "Observações", type: "textarea" }
    ],
    columns: ["photos", "name", "city", "capacity", "price", "status"] },
  { id: "decoradores", table: "vendors", title: "Decoradores", singular: "decorador", intro: "Compare orçamentos e estilos.",
    fields: vendorFields(), columns: ["name", "price", "contact", "status"],
    match: r => r.category === "Decoração", fixed: { category: "Decoração" } },
  { id: "fotografos", table: "vendors", title: "Fotógrafos", singular: "fotógrafo", intro: "Fotografia e vídeo.",
    fields: vendorFields(), columns: ["name", "price", "instagram", "status"],
    match: r => r.category === "Fotografia", fixed: { category: "Fotografia" } },
  { id: "fornecedores", table: "vendors", title: "Outros fornecedores", singular: "fornecedor", intro: "Buffet, música, bolo, convites e o resto.",
    fields: vendorFields(OTHER_CATS), columns: ["category", "name", "price", "status"],
    match: r => r.category !== "Decoração" && r.category !== "Fotografia" },
  { id: "orcamento", table: "expenses", title: "Orçamento", singular: "despesa", intro: "Estimado x pago, item a item.",
    fields: [
      { key: "description", label: "Item", type: "text", required: true },
      { key: "category", label: "Categoria", type: "text" },
      { key: "estimated", label: "Estimado (R$)", type: "number", money: true },
      { key: "paid", label: "Pago (R$)", type: "number", money: true },
      { key: "due_date", label: "Vencimento", type: "date" }
    ],
    columns: ["description", "category", "estimated", "paid", "due_date"],
    summary: r => `Estimado ${brl(sum(r, "estimated"))} · Pago ${brl(sum(r, "paid"))}` },
  { id: "tarefas", table: "tasks", title: "Tarefas", singular: "tarefa", intro: "O que falta fazer, com prazo.",
    fields: [
      { key: "title", label: "Tarefa", type: "text", required: true },
      { key: "due_date", label: "Prazo", type: "date" },
      { key: "done", label: "Concluída", type: "checkbox" }
    ],
    columns: ["done", "title", "due_date"],
    summary: r => `${r.filter(x => x.done).length} de ${r.length} concluídas` }
];

// ---------- Renderização ----------
const slug = (s: string) => (s === "Confirmado" || s === "Contratado" ? "ok" : s === "Recusou" || s === "Descartado" ? "no" : "wait");

function cell(f: Field, r: Row): string {
  const v = r[f.key];
  if (f.type === "photos") {
    const p: string[] = v ?? [];
    return p.length ? `<button class="thumb" data-gallery="${r.id}" aria-label="Ver ${p.length} foto(s)"><img src="${esc(p[0])}" alt=""><span>${p.length}</span></button>` : "";
  }
  if (f.type === "checkbox") return `<input type="checkbox" data-toggle="${f.key}" data-id="${r.id}" ${v ? "checked" : ""} aria-label="${esc(f.label)}">`;
  if (v === null || v === undefined || v === "") return "";
  if (f.money) return brl(Number(v));
  if (f.type === "date") return new Date(v + "T00:00").toLocaleDateString("pt-BR");
  if (f.type === "url") return `<a href="${esc(v)}" target="_blank" rel="noopener">abrir</a>`;
  if (f.key === "status" || f.key === "rsvp") return `<span class="badge ${slug(v)}">${esc(v)}</span>`;
  return esc(v);
}

async function renderEntity(e: Entity) {
  const rows = (await store.list(e.table)).filter(e.match ?? (() => true));
  const cols = e.columns.map(k => e.fields.find(f => f.key === k)!);
  main.innerHTML = `${banner()}
    <div class="head"><h2>${e.title}</h2><button class="primary" id="add">Adicionar ${e.singular}</button></div>
    <p class="sub">${e.intro}${e.summary ? " " + esc(e.summary(rows)) : ""}</p>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join("")}<th></th></tr></thead><tbody>
    ${rows.map(r => `<tr>${cols.map(c => `<td>${cell(c, r)}</td>`).join("")}<td class="act"><button class="link" data-edit="${r.id}">Editar</button><button class="link" data-del="${r.id}">Excluir</button></td></tr>`).join("")}
    </tbody></table></div>` : `<div class="tablewrap empty">Nada por aqui ainda. Adicione o primeiro ${e.singular}.</div>`}`;

  document.getElementById("add")!.onclick = () => openForm(e, {});
  main.querySelectorAll<HTMLElement>("[data-edit]").forEach(b => b.onclick = () => openForm(e, rows.find(r => r.id === b.dataset.edit)!));
  main.querySelectorAll<HTMLElement>("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Excluir este item?")) return;
    await run(() => store.remove(e.table, b.dataset.del!), "Excluído");
    renderEntity(e);
  });
  main.querySelectorAll<HTMLElement>("[data-gallery]").forEach(b => b.onclick = () => openGallery(rows.find(r => r.id === b.dataset.gallery)!));
  main.querySelectorAll<HTMLInputElement>("[data-toggle]").forEach(b => b.onchange = async () => {
    const r = rows.find(x => x.id === b.dataset.id)!;
    await run(() => store.save(e.table, { ...r, [b.dataset.toggle!]: b.checked }), "Atualizado");
    renderEntity(e);
  });
}

function openForm(e: Entity, r: Partial<Row>) {
  form.innerHTML = `<h2>${r.id ? "Editar" : "Novo"} ${e.singular}</h2>` + e.fields.map(f => {
    const v = r[f.key] ?? "";
    const attrs = `name="${f.key}" ${f.required ? "required" : ""}`;
    const input = f.type === "select" ? `<select ${attrs}>${(f.options ?? []).map(o => `<option ${o === (v || f.options![0]) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : f.type === "textarea" ? `<textarea ${attrs} rows="3">${esc(v)}</textarea>`
      : f.type === "checkbox" ? `<input type="checkbox" ${attrs} ${v ? "checked" : ""}>`
      : f.type === "photos" ? `<input type="file" id="ph-in" accept="image/*" multiple></label><div class="ph" id="ph"></div><label hidden>`
      : `<input type="${f.type}" ${attrs} value="${esc(v)}" ${f.type === "number" ? 'step="any" min="0"' : ""}>`;
    return `<label>${f.label}${input}</label>`;
  }).join("") + `<div class="row"><button type="button" id="cancel">Cancelar</button><button class="primary" type="submit">Salvar</button></div>`;
  document.getElementById("cancel")!.onclick = () => dlg.close();

  type Item = string | { blob: Blob; url: string };
  const items: Item[] = [...(r.photos ?? [])];
  const drawPh = () => {
    const box = document.getElementById("ph"); if (!box) return;
    box.innerHTML = items.map((it, k) => `<div><img src="${esc(typeof it === "string" ? it : it.url)}" alt="Foto ${k + 1}"><button type="button" data-rm="${k}" aria-label="Remover foto ${k + 1}">×</button></div>`).join("");
    box.querySelectorAll<HTMLElement>("[data-rm]").forEach(b => b.onclick = () => { items.splice(Number(b.dataset.rm), 1); drawPh(); });
  };
  const inp = document.getElementById("ph-in") as HTMLInputElement | null;
  if (inp) {
    drawPh();
    inp.onchange = async () => {
      for (const f of Array.from(inp.files ?? [])) {
        try { const blob = await shrink(f); items.push({ blob, url: URL.createObjectURL(blob) }); }
        catch { toast("Não foi possível ler " + f.name); }
      }
      inp.value = ""; drawPh();
    };
  }

  form.onsubmit = async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const ok = await run(async () => {
      const data: Row = { ...r, ...e.fixed } as Row;
      for (const f of e.fields) {
        if (f.type === "photos") { data[f.key] = await Promise.all(items.map(it => typeof it === "string" ? it : uploadPhoto(it.blob))); continue; }
        const v = fd.get(f.key);
        data[f.key] = f.type === "checkbox" ? v !== null : f.type === "number" ? (v === "" ? null : Number(v)) : v === "" ? null : v;
      }
      await store.save(e.table, data);
    }, "Salvo");
    if (ok) { dlg.close(); renderEntity(e); }
  };
  dlg.showModal();
}

async function run(fn: () => Promise<void>, ok: string): Promise<boolean> {
  try { await fn(); toast(ok); return true; } catch (err: any) { toast("Erro: " + (err?.message ?? err)); return false; }
}

// ---------- Fotos: reduz a imagem e envia ao Storage do Supabase (ou guarda local) ----------
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Imagem inválida")), "image/jpeg", 0.82));
}

async function uploadPhoto(b: Blob): Promise<string> {
  if (cloud) {
    const path = `${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from("fotos-locais").upload(path, b, { contentType: "image/jpeg" });
    if (error) throw error;
    return sb.storage.from("fotos-locais").getPublicUrl(path).data.publicUrl;
  }
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
}

function openGallery(r: Row) {
  const gal = document.getElementById("gal") as HTMLDialogElement;
  const p: string[] = r.photos ?? [];
  let i = 0;
  const draw = () => {
    gal.innerHTML = `<h2>${esc(r.name)}</h2><img class="big" src="${esc(p[i])}" alt="Foto ${i + 1} de ${esc(r.name)}">
      <div class="strip">${p.map((s, k) => `<button data-k="${k}" class="${k === i ? "on" : ""}" aria-label="Foto ${k + 1}"><img src="${esc(s)}" alt=""></button>`).join("")}</div>
      <div class="row"><button class="primary" id="gclose">Fechar</button></div>`;
    gal.querySelectorAll<HTMLElement>("[data-k]").forEach(b => b.onclick = () => { i = Number(b.dataset.k); draw(); });
    document.getElementById("gclose")!.onclick = () => gal.close();
  };
  draw(); gal.showModal();
}

const banner = () => cloud ? "" : `<div class="banner">Modo local: os dados ficam só neste navegador. Preencha o <b>config.js</b> para salvar no Supabase.</div>`;

async function renderHome() {
  const [guests, venues, vendors, expenses, tasks, settings] = await Promise.all(["guests", "venues", "vendors", "expenses", "tasks", "settings"].map(t => store.list(t)));
  const get = (k: string) => settings.find(s => s.key === k)?.value ?? "";
  const date = get("wedding_date"), budget = Number(get("budget")) || 0;
  const days = date ? Math.ceil((new Date(date + "T00:00").getTime() - Date.now()) / 864e5) : null;
  const headline = days === null ? `Quando é o <span>grande dia</span>?` : days > 0 ? `Faltam <span>${days}</span> dias.` : days === 0 ? `É <span>hoje</span>!` : `Vocês já se casaram.`;
  const heads = (s: string) => guests.filter(g => g.rsvp === s).reduce((a, g) => a + 1 + (Number(g.companions) || 0), 0);
  const estimated = sum(expenses, "estimated"), paid = sum(expenses, "paid");
  const hired = [...venues, ...vendors].filter(x => x.status === "Contratado").length;
  const pct = (a: number, b: number) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
  main.innerHTML = `${banner()}
    <section class="hero"><h1>${headline}</h1></section>
    <div class="settings">
      <label>Data do casamento<input type="date" id="s-date" value="${esc(date)}"></label>
      <label>Orçamento total (R$)<input type="number" id="s-budget" min="0" step="any" value="${budget || ""}"></label>
    </div>
    <div class="stats">
      <div class="stat"><b>${heads("Confirmado")} confirmados</b><span>${heads("Pendente")} pendentes · ${guests.length} convites</span></div>
      <div class="stat"><b>${hired} contratados</b><span>${venues.length} locais e ${vendors.length} fornecedores na lista</span></div>
      <div class="stat"><b>${brl(paid)} pagos</b><span>de ${brl(estimated)} estimados${budget ? ` · orçamento ${brl(budget)}` : ""}</span><div class="bar"><i style="width:${pct(paid, budget || estimated)}%"></i></div></div>
      <div class="stat"><b>${tasks.filter(t => t.done).length} de ${tasks.length} tarefas</b><span>concluídas</span><div class="bar"><i style="width:${pct(tasks.filter(t => t.done).length, tasks.length)}%"></i></div></div>
    </div>`;
  const save = (key: string, el: HTMLInputElement) => el.onchange = async () => {
    const cur = settings.find(s => s.key === key);
    await run(() => store.save("settings", { ...(cur ?? {}), key, value: el.value }), "Salvo");
    renderHome();
  };
  save("wedding_date", document.getElementById("s-date") as HTMLInputElement);
  save("budget", document.getElementById("s-budget") as HTMLInputElement);
}

async function route() {
  const id = location.hash.slice(1) || "inicio";
  nav.innerHTML = [["inicio", "Início"], ...entities.map(e => [e.id, e.title])].map(([i, t]) => `<a href="#${i}" ${i === id ? 'aria-current="page"' : ""}>${t}</a>`).join("");
  try {
    const e = entities.find(x => x.id === id);
    if (e) await renderEntity(e); else await renderHome();
  } catch (err: any) { main.innerHTML = `<div class="banner">Não foi possível carregar os dados: ${esc(err?.message ?? err)}. Confira o config.js e se o supabase.sql foi executado.</div>`; }
}
window.addEventListener("hashchange", route);
route();
