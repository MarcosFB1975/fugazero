import { useState, useRef, useEffect } from "react";

const ACCENT = "#00C48C";
const BG = "#0a0a0a";
const CARD = "#141414";
const BORDER = "#222";
const TEXT = "#e0e0e0";
const MUTED = "#888";
const RED = "#ff4d4f";
const YELLOW = "#faad14";
const GREEN = ACCENT;

// Lista de contraseñas válidas — una por cliente
// Para agregar: escribe la nueva entre comillas separada por coma
// Para quitar: borra la línea del cliente que dejó de pagar
const VALID_PASSWORDS = (import.meta.env.VITE_ACCESS_PASSWORDS || "")
  .split(",")
  .map(p => p.trim())
  .filter(Boolean);

const SYSTEM_PROMPT = `Eres FugaZero IA, un sistema experto en auditoría financiera para pequeñas y medianas empresas. Tu función es detectar fugas de dinero invisibles: gastos recurrentes innecesarios, duplicados, olvidados o no justificados que drenan liquidez mes a mes sin que el empresario lo note.

Recibirás dos fuentes de información:
1. Respuestas del formulario de diagnóstico (contexto del negocio)
2. Extracto bancario en PDF (movimientos reales)

Tu trabajo es cruzar ambas fuentes, identificar patrones de fuga y generar un informe profesional estructurado.

INSTRUCCIONES DE ANÁLISIS:

FASE 1 — Lee las respuestas del formulario e identifica tipo de negocio, sector, tamaño, herramientas declaradas, proveedores activos, estimación de gastos recurrentes.

FASE 2 — Analiza todos los movimientos de débito del extracto. Para cada cargo recurrente identifica proveedor, frecuencia, importe mensual equivalente y clasifica en las 8 categorías:
[CAT-1] SUSCRIPCIONES DIGITALES SIN USO ACTIVO
[CAT-2] LICENCIAS DE SOFTWARE DUPLICADAS
[CAT-3] SERVICIOS CONTRATADOS Y OLVIDADOS
[CAT-4] PROVEEDORES INACTIVOS EN NÓMINA
[CAT-5] COMISIONES Y CARGOS BANCARIOS REVISABLES
[CAT-6] SEGUROS NO REVISADOS O DUPLICADOS
[CAT-7] SERVICIOS DE INFRAESTRUCTURA INNECESARIOS
[CAT-8] GASTOS RECURRENTES SIN JUSTIFICACIÓN CLARA

FASE 3 — Cruza formulario con extracto. Cargos no mencionados = posible fuga. Servicios mencionados sin cargo = inconsistencia. Duplicados = fuga confirmada.

FASE 4 — RESPONDE ÚNICAMENTE EN JSON VÁLIDO. Sin markdown, sin backticks, sin texto adicional. Estructura exacta:

{
  "empresa": "nombre",
  "periodo": "fechas del extracto",
  "resumen": {"total_fugas": 0, "total_mensual": 0, "total_anual": 0},
  "fugas": [{"nombre": "Nombre del servicio", "categoria": "CAT-1", "importe_mensual": 0, "frecuencia": "mensual", "descripcion": "descripción", "prioridad": "ALTA", "accion": "acción recomendada"}],
  "resumen_categorias": [{"categoria": "CAT-1", "nombre": "Suscripciones sin uso", "fugas": 0, "impacto": 0}],
  "proyeccion": {"mensual": 0, "anual": 0, "tres_anos": 0},
  "inconsistencias": ["texto"],
  "proximos_pasos": ["paso 1", "paso 2", "paso 3", "paso 4"]
}

Tono: profesional, directo, sin alarmar. Sé específico. No inventes datos. Coloca ambiguos en CAT-8.`;

const LOADING_MSGS = [
  "Leyendo extracto bancario...",
  "Cruzando datos con formulario...",
  "Identificando fugas recurrentes...",
  "Clasificando por categoría...",
  "Calculando impacto financiero...",
  "Generando informe de auditoría..."
];

const priorityColor = p => p === "ALTA" ? RED : p === "MEDIA" ? YELLOW : GREEN;
const catLabel = c => ({"CAT-1":"Suscripciones sin uso","CAT-2":"Licencias duplicadas","CAT-3":"Servicios olvidados","CAT-4":"Proveedores inactivos","CAT-5":"Comisiones bancarias","CAT-6":"Seguros revisables","CAT-7":"Infraestructura innecesaria","CAT-8":"Sin justificación clara"}[c] || c);
const fmt = n => "$" + Number(n || 0).toLocaleString("en-US", {minimumFractionDigits:0, maximumFractionDigits:0});

const inputStyle = {width:"100%", padding:"10px 14px", background:"#1a1a1a", border:`1px solid ${BORDER}`, borderRadius:8, color:TEXT, fontSize:14, outline:"none", boxSizing:"border-box"};
const labelStyle = {display:"block", marginBottom:6, color:MUTED, fontSize:13, fontWeight:500};
const btnPrimary = {padding:"12px 32px", background:ACCENT, color:"#000", border:"none", borderRadius:8, fontSize:15, fontWeight:700, cursor:"pointer", letterSpacing:0.3};

export default function FugaZeroApp() {
  const [auth, setAuth] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({empresa:"", sector:"", tamano:"", herramientas:"", proveedores:"", gastos_est:""});
  const [file, setFile] = useState(null);
  const [fileBase64, setFileBase64] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef();
  const reportRef = useRef();

  useEffect(() => {
    if (!loading) return;
    const iv = setInterval(() => setLoadingIdx(i => (i + 1) % LOADING_MSGS.length), 2800);
    return () => clearInterval(iv);
  }, [loading]);

  const handleLogin = () => {
    if (VALID_PASSWORDS.includes(pwInput.trim())) {
      setAuth(true); setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    const r = new FileReader();
    r.onload = () => setFileBase64(r.result.split(",")[1]);
    r.readAsDataURL(f);
  };

  const runAudit = async () => {
    setLoading(true); setError(null); setLoadingIdx(0);
    const userMsg = `FORMULARIO DE DIAGNÓSTICO:\n- Empresa: ${form.empresa}\n- Sector: ${form.sector}\n- Tamaño: ${form.tamano}\n- Herramientas/servicios declarados: ${form.herramientas}\n- Proveedores activos: ${form.proveedores}\n- Estimación de gastos recurrentes mensuales: ${form.gastos_est}\n\nEXTRACTO BANCARIO: adjunto en PDF.\n\nAnaliza ambas fuentes, cruza los datos y genera el informe JSON.`;
    try {
      const res = await fetch("/api/chat", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({system:SYSTEM_PROMPT, messages:[{role:"user", content:[
          {type:"document", source:{type:"base64", media_type:"application/pdf", data:fileBase64}},
          {type:"text", text:userMsg}
        ]}]})
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Error de API");
      const txt = data.content.map(c => c.text||"").join("").replace(/```json|```/g,"").trim();
      setReport(JSON.parse(txt)); setStep(3);
    } catch(err) {
      setError(err.message || "Error al procesar. Intenta de nuevo.");
    } finally { setLoading(false); }
  };

  const copyReport = () => {
    if (!reportRef.current) return;
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(reportRef.current);
    sel.removeAllRanges(); sel.addRange(range);
    document.execCommand("copy"); sel.removeAllRanges();
  };

  const downloadPDF = () => {
    if (!report) return;
    const r = report;
    const today = new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"});
    const prioColor = p => p==="ALTA"?"#dc2626":p==="MEDIA"?"#d97706":"#059669";
    const prioLabel = p => p==="ALTA"?"🔴 ALTA":p==="MEDIA"?"🟡 MEDIA":"🟢 BAJA";
    const f = n => "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
    const fugasHTML = (r.fugas||[]).map(f2=>`<div class="fuga-card ${f2.prioridad.toLowerCase()}"><div class="fuga-header"><div class="fuga-nombre">${f2.nombre}</div><div class="fuga-prio" style="color:${prioColor(f2.prioridad)}">${prioLabel(f2.prioridad)}</div></div><div class="fuga-meta"><span class="tag">${f2.categoria} — ${catLabel(f2.categoria)}</span><span class="tag">${f(f2.importe_mensual)}/mes</span><span class="tag">${f2.frecuencia}</span></div><p class="fuga-desc">${f2.descripcion}</p><div class="fuga-accion">→ ${f2.accion}</div></div>`).join("");
    const catRows = (r.resumen_categorias||[]).filter(c=>c.fugas>0).map(c=>`<tr><td>${c.categoria}</td><td>${c.nombre}</td><td class="center">${c.fugas}</td><td class="right red">${f(c.impacto)}</td></tr>`).join("");
    const inconsHTML = (r.inconsistencias||[]).map(t=>`<li>${t}</li>`).join("");
    const pasosHTML = (r.proximos_pasos||[]).map((p,i)=>`<div class="paso"><span class="paso-num">${i+1}</span><span>${p}</span></div>`).join("");
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe FugaZero IA</title><style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;color:#1a1a1a;background:#fff;font-size:13px;line-height:1.6}.header{background:#0a0a0a;padding:32px 48px;display:flex;justify-content:space-between;align-items:center}.logo{font-size:26px;font-weight:800;color:#fff}.logo span{color:#00C48C}.tagline{font-size:11px;color:#888;margin-top:2px;letter-spacing:1px;text-transform:uppercase}.header-right{text-align:right;color:#aaa;font-size:11px;line-height:1.8}.header-right strong{color:#fff;font-size:13px}.accent-bar{height:4px;background:linear-gradient(90deg,#00C48C,#00a374)}.content{padding:36px 48px}.section-title{font-size:11px;font-weight:700;color:#00C48C;text-transform:uppercase;letter-spacing:2px;margin-bottom:14px;margin-top:32px;padding-bottom:6px;border-bottom:1px solid #e5e7eb}.resumen-grid{display:flex;gap:12px}.resumen-card{flex:1;background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center}.resumen-card.red .valor{color:#dc2626}.resumen-card.yellow .valor{color:#d97706}.resumen-card.green .valor{color:#059669}.valor{font-size:24px;font-weight:800}.label{font-size:10px;color:#6b7280;margin-top:3px;font-weight:500;text-transform:uppercase;letter-spacing:.5px}.fuga-card{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:10px;border-left:4px solid #e5e7eb;page-break-inside:avoid}.fuga-card.alta{border-left-color:#dc2626}.fuga-card.media{border-left-color:#d97706}.fuga-card.baja{border-left-color:#059669}.fuga-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.fuga-nombre{font-size:14px;font-weight:700}.fuga-prio{font-size:11px;font-weight:700}.fuga-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.tag{background:#f3f4f6;color:#374151;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:500}.fuga-desc{color:#374151;font-size:12px;margin-bottom:8px}.fuga-accion{font-size:12px;color:#059669;font-weight:600}table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#f3f4f6;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.5px;padding:10px 12px;text-align:left}td{padding:9px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}tr.total td{font-weight:700;background:#f8f9fa;border-top:2px solid #e5e7eb}.center{text-align:center}.right{text-align:right}.red{color:#dc2626;font-weight:600}.proy-grid{display:flex;gap:12px}.proy-card{flex:1;background:#f0fdf7;border:1px solid #a7f3d0;border-radius:8px;padding:16px;text-align:center}.proy-card .valor{font-size:22px;font-weight:800;color:#059669}.proy-card .label{font-size:10px;color:#065f46;margin-top:3px;font-weight:600;text-transform:uppercase}.inconsistencias-list{list-style:none}.inconsistencias-list li{padding:7px 0;border-bottom:1px solid #f3f4f6;font-size:12px}.inconsistencias-list li::before{content:"⚠ ";color:#d97706}.paso{display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f3f4f6}.paso-num{background:#00C48C;color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}.legal{background:#f8f9fa;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin-top:32px;font-size:10.5px;color:#6b7280;line-height:1.6}.footer{background:#0a0a0a;padding:16px 48px;display:flex;justify-content:space-between;align-items:center;margin-top:32px}.footer-left{color:#555;font-size:10px}.footer-right{color:#00C48C;font-size:11px;font-weight:700}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.fuga-card{page-break-inside:avoid}}</style></head><body><div class="header"><div><div class="logo">Fuga<span>Zero</span> IA</div><div class="tagline">Auditoría de Fugas Financieras</div></div><div class="header-right"><strong>${r.empresa||form.empresa}</strong><br>Período: ${r.periodo||"—"}<br>Informe: ${today}</div></div><div class="accent-bar"></div><div class="content"><div class="section-title">Resumen Ejecutivo</div><div class="resumen-grid"><div class="resumen-card red"><div class="valor">${r.resumen?.total_fugas||0}</div><div class="label">Fugas detectadas</div></div><div class="resumen-card yellow"><div class="valor">${f(r.resumen?.total_mensual)}</div><div class="label">Impacto mensual</div></div><div class="resumen-card green"><div class="valor">${f(r.resumen?.total_anual)}</div><div class="label">Impacto anual</div></div></div><p style="font-size:12px;color:#4b5563;margin-top:12px;">En el período analizado se detectaron <strong>${r.resumen?.total_fugas||0} fugas financieras activas</strong> por un total de <strong>${f(r.resumen?.total_mensual)}/mes</strong> (${f(r.resumen?.total_anual)}/año).</p><div class="section-title">Fugas Detectadas</div>${fugasHTML||"<p style='color:#6b7280;font-size:12px;'>No se detectaron fugas.</p>"}<div class="section-title">Resumen por Categoría</div><table><thead><tr><th>Código</th><th>Categoría</th><th class="center">Fugas</th><th class="right">Impacto/mes</th></tr></thead><tbody>${catRows}<tr class="total"><td colspan="2">TOTAL</td><td class="center">${r.resumen?.total_fugas||0}</td><td class="right red">${f(r.resumen?.total_mensual)}</td></tr></tbody></table><div class="section-title">Proyección de Ahorro</div><div class="proy-grid"><div class="proy-card"><div class="valor">${f(r.proyeccion?.mensual)}</div><div class="label">Mensual</div></div><div class="proy-card"><div class="valor">${f(r.proyeccion?.anual)}</div><div class="label">Anual</div></div><div class="proy-card"><div class="valor">${f(r.proyeccion?.tres_anos)}</div><div class="label">3 años</div></div></div>${r.inconsistencias?.length?`<div class="section-title">Inconsistencias</div><ul class="inconsistencias-list">${inconsHTML}</ul>`:""}<div class="section-title">Próximos Pasos</div>${pasosHTML}<div class="legal"><strong>Nota legal:</strong> Informe generado mediante análisis automatizado asistido por IA. Las cifras son estimaciones. Verifique cada hallazgo antes de tomar decisiones. FugaZero IA no se responsabiliza de decisiones sin debida diligencia.</div></div><div class="footer"><div class="footer-left">app.fugazero.com · fugazero@kaelenai.com</div><div class="footer-right">FugaZero IA · ${today}</div></div><script>window.onload=()=>window.print()</script></body></html>`;
    const win = window.open("","_blank"); win.document.write(html); win.document.close();
  };

  // PANTALLA DE ACCESO
  if (!auth) return (
    <div style={{minHeight:"100%", background:BG, color:TEXT, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px"}}>
      <div style={{fontSize:13, letterSpacing:3, color:ACCENT, fontWeight:700, marginBottom:12, textTransform:"uppercase"}}>Acceso privado</div>
      <div style={{fontSize:32, fontWeight:800, letterSpacing:-1, marginBottom:6}}>Fuga<span style={{color:ACCENT}}>Zero</span> IA</div>
      <div style={{color:MUTED, fontSize:14, marginBottom:32}}>Ingresa tu clave de acceso para continuar</div>
      <div style={{width:"100%", maxWidth:360}}>
        <input
          style={{...inputStyle, fontSize:16, textAlign:"center", letterSpacing:2, marginBottom:8}}
          type="password"
          placeholder="••••••••"
          value={pwInput}
          onChange={e => { setPwInput(e.target.value); setPwError(false); }}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
        />
        {pwError && <div style={{color:RED, fontSize:13, textAlign:"center", marginBottom:8}}>Clave incorrecta. Verifica e intenta de nuevo.</div>}
        <button onClick={handleLogin} style={{...btnPrimary, width:"100%", marginTop:4}}>Entrar</button>
      </div>
      <div style={{color:"#333", fontSize:12, marginTop:32}}>¿No tienes acceso? Escríbenos a fugazero@kaelenai.com</div>
    </div>
  );

  // LANDING
  if (step === 0) return (
    <div style={{minHeight:"100%", background:BG, color:TEXT, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", textAlign:"center"}}>
      <div style={{fontSize:13, letterSpacing:3, color:ACCENT, fontWeight:700, marginBottom:12, textTransform:"uppercase"}}>Auditoría Financiera con IA</div>
      <div style={{fontSize:38, fontWeight:800, letterSpacing:-1, marginBottom:8}}>Fuga<span style={{color:ACCENT}}>Zero</span> IA</div>
      <div style={{color:MUTED, fontSize:16, maxWidth:440, lineHeight:1.6, marginBottom:36}}>Detecta gastos recurrentes invisibles que drenan la liquidez de tu empresa mes a mes.</div>
      <div style={{display:"flex", gap:20, flexWrap:"wrap", justifyContent:"center", marginBottom:40}}>
        {[["8","Categorías de fuga"],["PDF","Análisis de extracto"],["IA","Cruce inteligente"]].map(([n,l]) => (
          <div key={l} style={{background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:"18px 22px", minWidth:120, textAlign:"center"}}>
            <div style={{fontSize:24, fontWeight:800, color:ACCENT}}>{n}</div>
            <div style={{fontSize:12, color:MUTED, marginTop:4}}>{l}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setStep(1)} style={btnPrimary}>Iniciar auditoría</button>
    </div>
  );

  // FORMULARIO
  if (step === 1) return (
    <div style={{minHeight:"100%", background:BG, color:TEXT, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", padding:"32px 20px", maxWidth:540, margin:"0 auto"}}>
      <div style={{fontSize:11, letterSpacing:2, color:ACCENT, fontWeight:700, textTransform:"uppercase", marginBottom:4}}>Paso 1 de 2</div>
      <div style={{fontSize:22, fontWeight:700, marginBottom:4}}>Diagnóstico del negocio</div>
      <div style={{color:MUTED, fontSize:13, marginBottom:28}}>Completa la información de tu empresa para cruzarla con el extracto bancario.</div>
      <div style={{display:"flex", flexDirection:"column", gap:22}}>
        <div><label style={labelStyle}>Nombre de la empresa</label><input style={inputStyle} value={form.empresa} onChange={e=>setForm({...form,empresa:e.target.value})} placeholder="Ej: Logística Andina SRL"/></div>
        <div><label style={labelStyle}>Sector / Industria</label><input style={inputStyle} value={form.sector} onChange={e=>setForm({...form,sector:e.target.value})} placeholder="Ej: Transporte y logística"/></div>
        <div>
          <label style={labelStyle}>Tamaño del negocio</label>
          <input style={inputStyle} value={form.tamano} onChange={e=>setForm({...form,tamano:e.target.value})} placeholder="Ej: 12 empleados, $25K/mes"/>
          <div style={{fontSize:12,color:MUTED,marginTop:5,lineHeight:1.5}}>Permite detectar servicios sobredimensionados para el tamaño real del negocio.</div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...labelStyle,marginBottom:0}}>Herramientas y servicios digitales que usas</label>
            <span style={{fontSize:11,color:ACCENT,fontWeight:600}}>OPCIONAL</span>
          </div>
          <textarea style={{...inputStyle,minHeight:70,resize:"vertical"}} value={form.herramientas} onChange={e=>setForm({...form,herramientas:e.target.value})} placeholder="Ej: Gmail, Zoom, QuickBooks, Slack..."/>
          <div style={{fontSize:12,color:MUTED,marginTop:5,lineHeight:1.5}}>Escribe las que recuerdes. La IA marcará los cargos no declarados como posibles fugas.</div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...labelStyle,marginBottom:0}}>Personas o servicios que pagas regularmente</label>
            <span style={{fontSize:11,color:ACCENT,fontWeight:600}}>OPCIONAL</span>
          </div>
          <textarea style={{...inputStyle,minHeight:70,resize:"vertical"}} value={form.proveedores} onChange={e=>setForm({...form,proveedores:e.target.value})} placeholder="Ej: contador, agencia de diseño, seguro..."/>
          <div style={{fontSize:12,color:MUTED,marginTop:5,lineHeight:1.5}}>Si no estás seguro, déjalo en blanco. La IA lo detectará en el extracto.</div>
        </div>
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <label style={{...labelStyle,marginBottom:0}}>Estimación de gastos fijos mensuales (USD)</label>
            <span style={{fontSize:11,color:ACCENT,fontWeight:600}}>OPCIONAL</span>
          </div>
          <input style={inputStyle} value={form.gastos_est} onChange={e=>setForm({...form,gastos_est:e.target.value})} placeholder="Ej: $2,000/mes aprox."/>
          <div style={{fontSize:12,color:MUTED,marginTop:5,lineHeight:1.5}}>Incluye suscripciones y servicios. No incluyas sueldos, impuestos ni servicios básicos.</div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:28}}>
        <button onClick={()=>setStep(0)} style={{...btnPrimary,background:"transparent",color:MUTED,border:`1px solid ${BORDER}`}}>Atrás</button>
        <button onClick={()=>{if(form.empresa&&form.sector)setStep(2);}} style={{...btnPrimary,opacity:form.empresa&&form.sector?1:0.4}}>Siguiente</button>
      </div>
    </div>
  );

  // UPLOAD
  if (step === 2 && !loading) return (
    <div style={{minHeight:"100%", background:BG, color:TEXT, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", padding:"32px 20px", maxWidth:540, margin:"0 auto"}}>
      <div style={{fontSize:11,letterSpacing:2,color:ACCENT,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Paso 2 de 2</div>
      <div style={{fontSize:22,fontWeight:700,marginBottom:4}}>Extracto bancario</div>
      <div style={{color:MUTED,fontSize:13,marginBottom:28}}>Sube el extracto bancario en PDF. Cuantos más meses incluya, más preciso será el análisis.</div>
      <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${file?ACCENT:BORDER}`,borderRadius:12,padding:"40px 20px",textAlign:"center",cursor:"pointer",background:file?"rgba(0,196,140,0.05)":"transparent"}}>
        <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} style={{display:"none"}}/>
        {file ? (
          <><div style={{fontSize:32,marginBottom:8}}>📄</div><div style={{fontWeight:600,fontSize:15}}>{file.name}</div><div style={{color:MUTED,fontSize:12,marginTop:4}}>{(file.size/1024).toFixed(0)} KB — Listo para análisis</div></>
        ) : (
          <><div style={{fontSize:32,marginBottom:8}}>⬆️</div><div style={{fontWeight:600,fontSize:15}}>Arrastra o haz clic para subir</div><div style={{color:MUTED,fontSize:12,marginTop:4}}>Solo archivos PDF</div></>
        )}
      </div>
      {error && <div style={{marginTop:16,padding:"12px 16px",background:"rgba(255,77,79,0.1)",border:`1px solid ${RED}`,borderRadius:8,color:RED,fontSize:13}}>{error}</div>}
      <div style={{display:"flex",justifyContent:"space-between",marginTop:28}}>
        <button onClick={()=>setStep(1)} style={{...btnPrimary,background:"transparent",color:MUTED,border:`1px solid ${BORDER}`}}>Atrás</button>
        <button onClick={runAudit} style={{...btnPrimary,opacity:fileBase64?1:0.4}} disabled={!fileBase64}>Analizar con IA</button>
      </div>
    </div>
  );

  // LOADING
  if (loading) return (
    <div style={{minHeight:"100%",background:BG,color:TEXT,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40}}>
      <div style={{width:56,height:56,border:`3px solid ${BORDER}`,borderTop:`3px solid ${ACCENT}`,borderRadius:"50%",animation:"spin 1s linear infinite",marginBottom:28}}/>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Analizando tu extracto</div>
      <div style={{color:ACCENT,fontSize:14,fontWeight:500}}>{LOADING_MSGS[loadingIdx]}</div>
      <div style={{color:MUTED,fontSize:12,marginTop:20}}>Esto puede tomar 30-60 segundos</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // INFORME
  if (step === 3 && report) {
    const r = report;
    return (
      <div style={{minHeight:"100%",background:BG,color:TEXT,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",padding:"28px 16px",maxWidth:640,margin:"0 auto"}}>
        <div ref={reportRef}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:11,letterSpacing:3,color:ACCENT,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Informe de Auditoría</div>
            <div style={{fontSize:26,fontWeight:800}}>Fuga<span style={{color:ACCENT}}>Zero</span> IA</div>
            <div style={{color:MUTED,fontSize:13,marginTop:6}}>{r.empresa||form.empresa} — {r.periodo||"Período analizado"}</div>
          </div>
          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:20,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:ACCENT}}>Resumen Ejecutivo</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              {[[r.resumen?.total_fugas||0,"Fugas detectadas",RED],[fmt(r.resumen?.total_mensual),"Impacto / mes",YELLOW],[fmt(r.resumen?.total_anual),"Impacto / año",ACCENT]].map(([v,l,c])=>(
                <div key={l} style={{flex:"1 1 100px",background:BG,borderRadius:8,padding:"14px 16px",textAlign:"center"}}>
                  <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                  <div style={{fontSize:11,color:MUTED,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          {r.fugas?.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:ACCENT}}>Fugas Detectadas</div>
              {r.fugas.map((f2,i)=>(
                <div key={i} style={{background:CARD,border:`1px solid ${BORDER}`,borderLeft:`4px solid ${priorityColor(f2.prioridad)}`,borderRadius:10,padding:"14px 16px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontWeight:700,fontSize:14}}>{f2.nombre}</div>
                    <span style={{fontSize:11,fontWeight:700,color:priorityColor(f2.prioridad)}}>{f2.prioridad}</span>
                  </div>
                  <div style={{display:"flex",gap:8,fontSize:12,color:MUTED,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{background:BG,padding:"2px 8px",borderRadius:4}}>{f2.categoria}</span>
                    <span>{fmt(f2.importe_mensual)}/mes</span>
                    <span>{f2.frecuencia}</span>
                  </div>
                  <div style={{fontSize:13,color:"#bbb",lineHeight:1.5,marginBottom:6}}>{f2.descripcion}</div>
                  <div style={{fontSize:12,color:ACCENT}}>→ {f2.accion}</div>
                </div>
              ))}
            </div>
          )}
          {r.resumen_categorias?.length>0&&(
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:16,marginBottom:16,overflowX:"auto"}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:ACCENT}}>Resumen por Categoría</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  <th style={{textAlign:"left",padding:"6px 8px",color:MUTED,fontWeight:600}}>Categoría</th>
                  <th style={{textAlign:"center",padding:"6px 8px",color:MUTED,fontWeight:600}}>Fugas</th>
                  <th style={{textAlign:"right",padding:"6px 8px",color:MUTED,fontWeight:600}}>Impacto/mes</th>
                </tr></thead>
                <tbody>
                  {r.resumen_categorias.filter(c=>c.fugas>0).map((c,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${BORDER}20`}}>
                      <td style={{padding:"8px",fontSize:12}}>{c.categoria} {c.nombre}</td>
                      <td style={{textAlign:"center",padding:"8px",fontWeight:600}}>{c.fugas}</td>
                      <td style={{textAlign:"right",padding:"8px",fontWeight:600,color:RED}}>{fmt(c.impacto)}</td>
                    </tr>
                  ))}
                  <tr style={{borderTop:`1px solid ${BORDER}`}}>
                    <td style={{padding:"8px",fontWeight:700}}>TOTAL</td>
                    <td style={{textAlign:"center",padding:"8px",fontWeight:700}}>{r.resumen?.total_fugas||0}</td>
                    <td style={{textAlign:"right",padding:"8px",fontWeight:700,color:RED}}>{fmt(r.resumen?.total_mensual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {r.proyeccion&&(
            <div style={{background:`linear-gradient(135deg,${CARD},#0d1f18)`,border:`1px solid ${ACCENT}30`,borderRadius:12,padding:20,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:ACCENT}}>Proyección de Ahorro</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[[fmt(r.proyeccion.mensual),"Mensual"],[fmt(r.proyeccion.anual),"Anual"],[fmt(r.proyeccion.tres_anos),"3 años"]].map(([v,l])=>(
                  <div key={l} style={{flex:"1 1 100px",textAlign:"center"}}>
                    <div style={{fontSize:22,fontWeight:800,color:ACCENT}}>{v}</div>
                    <div style={{fontSize:11,color:MUTED}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {r.inconsistencias?.length>0&&(
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:16,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:YELLOW}}>Inconsistencias Detectadas</div>
              {r.inconsistencias.map((t,i)=>(
                <div key={i} style={{fontSize:13,color:"#bbb",padding:"6px 0",borderBottom:i<r.inconsistencias.length-1?`1px solid ${BORDER}20`:"none"}}>⚠ {t}</div>
              ))}
            </div>
          )}
          {r.proximos_pasos?.length>0&&(
            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:16,marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:ACCENT}}>Próximos Pasos</div>
              {r.proximos_pasos.map((p,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 0",borderBottom:i<r.proximos_pasos.length-1?`1px solid ${BORDER}20`:"none"}}>
                  <span style={{background:ACCENT,color:"#000",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>{i+1}</span>
                  <span style={{fontSize:13,color:"#ccc",lineHeight:1.5}}>{p}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{fontSize:11,color:MUTED,lineHeight:1.5,padding:"12px 0",borderTop:`1px solid ${BORDER}20`}}>
            Informe generado mediante análisis automatizado asistido por inteligencia artificial. Las cifras son estimaciones. Verifique cada hallazgo antes de tomar decisiones financieras.
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
          <button onClick={downloadPDF} style={{...btnPrimary,flex:1}}>⬇ Descargar PDF</button>
          <button onClick={copyReport} style={{...btnPrimary,flex:1,background:"transparent",color:TEXT,border:`1px solid ${BORDER}`}}>Copiar informe</button>
          <button onClick={()=>{setStep(0);setReport(null);setFile(null);setFileBase64(null);setForm({empresa:"",sector:"",tamano:"",herramientas:"",proveedores:"",gastos_est:""});}} style={{...btnPrimary,flex:1,background:"transparent",color:MUTED,border:`1px solid ${BORDER}`}}>Nueva auditoría</button>
        </div>
      </div>
    );
  }
  return null;
}
