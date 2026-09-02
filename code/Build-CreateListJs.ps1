# Baut create-list.js: legt im Browser (eingeloggte SharePoint-Session) die Liste samt Spalten und Ansichten an
$schema = Get-Content (Join-Path $PSScriptRoot 'schema.json') -Encoding UTF8 | ConvertFrom-Json
$compact = $schema | Select-Object internal,display,type,group,inDefaultView,description | ConvertTo-Json -Compress -Depth 3

$js = @'
const base='https://campussursee.sharepoint.com/sites/mgmts-ict-s';
const listTitle='Computer Inventar';
const cols=__SCHEMA__;
const hdr=async()=>{const d=await fetch(base+'/_api/contextinfo',{method:'POST',headers:{'Accept':'application/json;odata=nometadata'}}).then(r=>r.json());return {'Accept':'application/json;odata=nometadata','Content-Type':'application/json;odata=verbose','X-RequestDigest':d.FormDigestValue};};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let H=await hdr();
// 1) Liste anlegen (falls nicht vorhanden)
let r=await fetch(base+"/_api/web/lists/getbytitle('"+encodeURIComponent(listTitle)+"')",{headers:H});
let list;
if(r.status===404){
  r=await fetch(base+'/_api/web/lists',{method:'POST',headers:H,body:JSON.stringify({__metadata:{type:'SP.List'},Title:listTitle,BaseTemplate:100,Description:'Computer- und Benutzerinventar, automatisch mit SCCM synchronisiert',EnableVersioning:true,MajorVersionLimit:50})});
  if(!r.ok) throw new Error('Liste anlegen: '+r.status+' '+await r.text());
  list=await r.json();
} else { list=await r.json(); }
const lurl=base+"/_api/web/lists(guid'"+list.Id+"')";
// Title-Spalte umbenennen
await fetch(lurl+"/fields/getbyinternalnameortitle('Title')",{method:'POST',headers:{...H,'X-HTTP-Method':'MERGE','IF-MATCH':'*'},body:JSON.stringify({__metadata:{type:'SP.Field'},Title:'PC-Name'})});
// 2) vorhandene Felder
const existing=new Set((await fetch(lurl+'/fields?$select=InternalName&$top=500',{headers:H}).then(r=>r.json())).value.map(f=>f.InternalName));
const errors=[];let created=0;
for(const c of cols){
  if(c.type==='Title'||existing.has(c.internal)) continue;
  let xml;
  const common=`DisplayName="${esc(c.display)}" Name="${esc(c.internal)}" StaticName="${esc(c.internal)}" Group="${esc(c.group)}" Description="${esc(c.description||'')}"`;
  switch(c.type){
    case 'Text': xml=`<Field Type="Text" ${common} MaxLength="255" />`; break;
    case 'Note': xml=`<Field Type="Note" ${common} NumLines="6" RichText="FALSE" AppendOnly="FALSE" />`; break;
    case 'Boolean': xml=`<Field Type="Boolean" ${common}><Default>0</Default></Field>`; break;
    case 'Number': xml=`<Field Type="Number" ${common} Decimals="0" Commas="FALSE" />`; break;
    case 'DateTime': xml=`<Field Type="DateTime" ${common} Format="DateTime" FriendlyDisplayFormat="Disabled" />`; break;
  }
  const body=JSON.stringify({parameters:{__metadata:{type:'SP.XmlSchemaFieldCreationInformation'},SchemaXml:xml,Options:8+(c.inDefaultView?16:0)}});
  // Options: 8 = AddFieldInternalNameHint, 16 = AddFieldToDefaultView
  let rr=await fetch(lurl+'/fields/createfieldasxml',{method:'POST',headers:H,body});
  if(rr.status===403){H=await hdr();rr=await fetch(lurl+'/fields/createfieldasxml',{method:'POST',headers:H,body});}
  if(!rr.ok){errors.push(c.internal+': '+rr.status+' '+(await rr.text()).slice(0,300));} else created++;
}
({listId:list.Id, created, errors});
'@
$js = $js.Replace('__SCHEMA__', $compact)
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'create-list.js'), $js, [Text.UTF8Encoding]::new($false))
"create-list.js: $([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'create-list.js')).Length) Zeichen"
