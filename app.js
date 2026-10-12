const STORAGE_KEY='keepRichShiftsV2',PAYSTUB_KEY='keepRichPaystubsV1',PAY_DATE_VIEW_KEY='keepRichPayDateViewV1',RATE=.015;
const PREVIEW_MODE=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('preview'),money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}),compactMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}),shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}),longDate=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),monthName=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}),$=s=>document.querySelector(s),isoToday=()=>new Date().toISOString().slice(0,10);
let shifts=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'),editingId=null,calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarSelectedDate=isoToday();
if(PREVIEW_MODE)shifts=[{id:'preview-1',date:'2026-10-02',payDate:'2026-10-16',hours:7.5,hourlyWage:20,tips:84,sales:2160,transactions:43,items:67,notes:'Preview shift'},{id:'preview-2',date:'2026-10-05',payDate:'2026-10-16',hours:8,hourlyWage:20,tips:126,sales:2875,transactions:55,items:82,notes:'Preview shift'},{id:'preview-3',date:'2026-10-09',payDate:'2026-10-16',hours:6.5,hourlyWage:20,tips:72,sales:1940,transactions:38,items:59,notes:'Preview shift'},{id:'preview-4',date:'2026-10-12',payDate:'2026-10-30',hours:8,hourlyWage:21,tips:148,sales:3230,transactions:61,items:94,notes:'Preview shift'}];
$('#date').value=isoToday();

function value(id){const raw=$(`#${id}`).value.trim();return raw===''?null:Number(raw)}
function asDate(v){const[y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)}
function iso(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function has(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function sumKnown(list,key){const vals=list.map(r=>r[key]).filter(has).map(Number);return vals.length?vals.reduce((a,b)=>a+b,0):null}
function fmt(v){return has(v)?money.format(Number(v)):'—'}
function numFmt(v,digits=2){return has(v)?Number(v).toFixed(digits):'—'}
function shiftEarnings(shift){return has(shift.hours)&&has(shift.hourlyWage)?Number(shift.hours)*Number(shift.hourlyWage)+(has(shift.tips)?Number(shift.tips):0):null}
function latestHourlyWage(){return [...shifts].reverse().find(shift=>has(shift.hourlyWage))?.hourlyWage??''}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(shifts));window.KeepRichCloud?.changed('Shift data')}
function payDateLabel(dateString){return dateString?shortDate.format(asDate(dateString)):'Unassigned'}
function dashboardRows(){const selected=$('#dashboard-pay-date').value;return selected==='all'?shifts:selected==='unassigned'?shifts.filter(s=>!s.payDate):shifts.filter(s=>s.payDate===selected)}

function savedPaystubs(){try{const rows=JSON.parse(localStorage.getItem(PAYSTUB_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}}
function dashboardPaystubs(){const selected=$('#dashboard-pay-date').value,rows=savedPaystubs();return selected==='all'?rows:selected==='unassigned'?[]:rows.filter(stub=>stub.payDate===selected)}
function paystubAudits(){return savedPaystubs().map(stub=>{const assigned=shifts.filter(shift=>shift.payDate===stub.payDate),sales=sumKnown(assigned,'sales'),expected=has(sales)?sales*RATE:null,actual=has(stub.commission)?Number(stub.commission):null,difference=has(expected)&&has(actual)?actual-expected:null;return{...stub,sales,expected,actual,difference}})}

function strictShiftTotal(rows){const values=rows.map(shiftEarnings);return values.length&&values.every(has)?values.reduce((sum,value)=>sum+value,0):null}
function calendarRows(dateString){return shifts.filter(shift=>shift.date===dateString)}
function renderCalendarDetail(){
  const rows=calendarRows(calendarSelectedDate),hours=sumKnown(rows,'hours'),earnings=strictShiftTotal(rows),average=has(earnings)&&has(hours)&&hours>0?earnings/hours:null;
  $('#calendar-detail-date').textContent=longDate.format(asDate(calendarSelectedDate));
  $('#calendar-log-day').dataset.date=calendarSelectedDate;
  if(!rows.length){$('#calendar-detail-body').innerHTML='<p>No shift logged for this day yet.</p>';return}
  $('#calendar-detail-body').innerHTML=rows.map((shift,index)=>`<article class="calendar-shift-card"><div><span>${rows.length>1?`Shift ${index+1}`:'Daily earnings'}</span><strong>${fmt(shiftEarnings(shift))}</strong></div><div><span>Hourly with tips</span><strong>${has(shiftEarnings(shift))&&has(shift.hours)&&shift.hours>0?`${fmt(shiftEarnings(shift)/shift.hours)}/hr`:'—'}</strong></div><div><span>Tips</span><strong>${fmt(shift.tips)}</strong></div><div><span>Sales</span><strong>${fmt(shift.sales)}</strong></div><button type="button" data-calendar-edit="${shift.id}">Edit shift</button></article>`).join('')+`<p><strong>Day total:</strong> ${fmt(earnings)} · ${numFmt(hours)} hours · ${has(average)?`${fmt(average)}/hr`:'—'}</p>`;
}
function renderCalendar(){
  const year=calendarCursor.getFullYear(),month=calendarCursor.getMonth(),key=`${year}-${String(month+1).padStart(2,'0')}`;
  if(!calendarSelectedDate.startsWith(key))calendarSelectedDate=`${key}-01`;
  const monthRows=shifts.filter(shift=>shift.date?.startsWith(key)),hours=sumKnown(monthRows,'hours'),earnings=strictShiftTotal(monthRows),average=has(earnings)&&has(hours)&&hours>0?earnings/hours:null,days=new Date(year,month+1,0).getDate(),leading=new Date(year,month,1).getDay();
  $('#calendar-month').textContent=monthName.format(calendarCursor);$('#calendar-subtitle').textContent=`${PREVIEW_MODE?'Preview data · ':''}${monthRows.length?`${monthRows.length} logged shift${monthRows.length===1?'':'s'}`:'No shifts logged this month'}`;$('#calendar-total').textContent=fmt(earnings);$('#calendar-hours').textContent=numFmt(hours);$('#calendar-hourly').textContent=has(average)?`${fmt(average)}/hr`:'—';
  const cells=Array.from({length:leading},()=>'<span class="calendar-blank" aria-hidden="true"></span>');
  for(let day=1;day<=days;day+=1){const dateString=`${key}-${String(day).padStart(2,'0')}`,rows=calendarRows(dateString),dayHours=sumKnown(rows,'hours'),dayTotal=strictShiftTotal(rows),dayAverage=has(dayTotal)&&has(dayHours)&&dayHours>0?dayTotal/dayHours:null,classes=['calendar-day'];if(rows.length)classes.push('has-shift');if(dateString===isoToday())classes.push('is-today');if(dateString===calendarSelectedDate)classes.push('is-selected');const detail=rows.length?`${rows.length} shift${rows.length===1?'':'s'}, ${has(dayTotal)?fmt(dayTotal):'earnings unavailable'}`:'No shift logged';cells.push(`<button type="button" class="${classes.join(' ')}" data-calendar-date="${dateString}" aria-pressed="${dateString===calendarSelectedDate}" aria-label="${longDate.format(asDate(dateString))}: ${detail}"><span class="calendar-day__number">${day}</span>${rows.length?`<span class="calendar-day__count">${rows.length} shift${rows.length===1?'':'s'}</span><strong class="calendar-day__amount">${has(dayTotal)?compactMoney.format(dayTotal):'—'}</strong><span class="calendar-day__hourly">${has(dayAverage)?`${compactMoney.format(dayAverage)}/hr`:'rate needed'}</span>`:''}</button>`)}
  const trailing=(7-cells.length%7)%7;for(let index=0;index<trailing;index+=1)cells.push('<span class="calendar-blank" aria-hidden="true"></span>');$('#calendar-grid').innerHTML=cells.join('');renderCalendarDetail();
}

function renderAudit(){
  const records=paystubAudits(),auditable=records.filter(row=>has(row.expected)&&has(row.actual)),expected=auditable.length?auditable.reduce((sum,row)=>sum+row.expected,0):null,actual=auditable.length?auditable.reduce((sum,row)=>sum+row.actual,0):null,difference=auditable.length?actual-expected:null;
  $('#audit-expected').textContent=fmt(expected);$('#audit-paid').textContent=fmt(actual);$('#audit-difference').textContent=has(difference)?`${difference>=0?'+':''}${money.format(difference)}`:'—';$('#audit-difference').className=has(difference)?(difference>=-.01?'good':'bad'):'missing';
  $('#audit-message').textContent=!records.length?'Save a paystub to compare expected and paid commission.':!auditable.length?'Assign shifts to the same pay date as a saved paystub to run the audit.':Math.abs(difference)<.01?'Saved paystubs match the expected 1.5%.':difference<0?`Saved paystubs may be short ${money.format(Math.abs(difference))}.`:`Saved paystubs are ${money.format(difference)} above 1.5%.`;
  $('#audit-period-body').innerHTML=records.map(row=>`<tr><td>${payDateLabel(row.payDate)}</td><td>${fmt(row.sales)}</td><td>${fmt(row.expected)}</td><td>${fmt(row.actual)}</td><td class="${has(row.difference)?(row.difference>=-.01?'good':'bad'):'missing'}">${has(row.difference)?`${row.difference>=0?'+':''}${money.format(row.difference)}`:'—'}</td></tr>`).join('')||'<tr><td colspan="5" class="missing">No saved paystubs yet.</td></tr>';
}

function render(){
  renderPayDateOptions();
  const rows=dashboardRows(),paystubs=dashboardPaystubs(),sales=sumKnown(rows,'sales'),tips=sumKnown(rows,'tips'),actual=sumKnown(paystubs,'commission'),loggedHours=sumKnown(rows,'hours'),dailyEarnings=rows.map(shift=>shiftEarnings(shift)),shiftTotal=dailyEarnings.length&&dailyEarnings.every(has)?dailyEarnings.reduce((sum,value)=>sum+value,0):null,expected=has(sales)?sales*RATE:null,difference=has(expected)&&has(actual)?actual-expected:null,totalEarnings=has(shiftTotal)&&has(actual)?shiftTotal+actual:null,averageHourly=has(totalEarnings)&&has(loggedHours)&&loggedHours>0?totalEarnings/loggedHours:null;
  $('#stat-sales').textContent=fmt(sales);$('#stat-tips').textContent=fmt(tips);$('#stat-commission').textContent=fmt(actual);$('#stat-earnings').textContent=fmt(totalEarnings);$('#stat-hourly').textContent=fmt(averageHourly);
  const selectedPayDate=$('#dashboard-pay-date').value;
  $('#period-label').textContent=selectedPayDate==='all'?'All recorded shifts':selectedPayDate==='unassigned'?'Pay date unassigned':`Pay date ${payDateLabel(selectedPayDate)}`;
  $('#schedule-note').textContent='Grouped only by the paycheck date saved on each shift';
  $('#tip-rate').textContent=has(sales)&&has(tips)&&sales>0?`${(tips/sales*100).toFixed(1)}% of sales`:'Not enough data';
  $('#commission-delta').textContent=has(difference)?`${difference>=0?'+':''}${money.format(difference)} vs expected`:actual===null?'From saved paystubs':'Audit needs matching sales';
  $('#commission-delta').className=has(difference)?(difference>=-.01?'good':'bad'):'missing';
  renderAudit();renderSummary();renderHistory();renderChart();renderCalendar();
}

function renderSummary(){
  const groups={};shifts.forEach(s=>{const key=s.payDate||'unassigned';(groups[key]??=[]).push(s)});
  $('#summary-body').innerHTML=Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0])).map(([key,rows])=>{const sales=sumKnown(rows,'sales'),tips=sumKnown(rows,'tips'),hours=sumKnown(rows,'hours');return`<tr><td>${key==='unassigned'?'Unassigned':payDateLabel(key)}</td><td>${numFmt(hours)}</td><td>${fmt(sales)}</td><td>${fmt(tips)}</td><td>${has(sales)?fmt(sales*RATE):'—'}</td></tr>`}).join('')||'<tr><td colspan="5">No shifts saved yet.</td></tr>';
}

function renderPayDateOptions(){
  const dates=[...new Set([...shifts.map(s=>s.payDate),...savedPaystubs().map(s=>s.payDate)].filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const options='<option value="all">All pay dates</option>'+dates.map(date=>`<option value="${date}">${payDateLabel(date)}</option>`).join('')+(shifts.some(s=>!s.payDate)?'<option value="unassigned">Unassigned shifts</option>':'');
  const dashboard=$('#dashboard-pay-date'),historyFilter=$('#period-filter'),dashboardChoice=dashboard.value||localStorage.getItem(PAY_DATE_VIEW_KEY)||'all',historyChoice=historyFilter.value||'all';
  dashboard.innerHTML=options;historyFilter.innerHTML=options;
  dashboard.value=[...dashboard.options].some(option=>option.value===dashboardChoice)?dashboardChoice:'all';historyFilter.value=[...historyFilter.options].some(option=>option.value===historyChoice)?historyChoice:'all';
}

function filtered(){const q=$('#search').value.trim().toLowerCase(),payDate=$('#period-filter').value;return shifts.filter(s=>(payDate==='all'||(payDate==='unassigned'?!s.payDate:s.payDate===payDate))&&(!q||Object.values(s).join(' ').toLowerCase().includes(q))).sort((a,b)=>b.date.localeCompare(a.date))}
function renderHistory(){
  const rows=filtered();$('#history-body').innerHTML=rows.map(s=>{const expected=has(s.sales)?Number(s.sales)*RATE:null,average=has(s.sales)&&has(s.transactions)&&Number(s.transactions)>0?Number(s.sales)/Number(s.transactions):null,daily=shiftEarnings(s),note=s.notes?.trim();return`<tr><td>${s.date}</td><td>${s.payDate?payDateLabel(s.payDate):'—'}</td><td>${numFmt(s.hours)}</td><td>${fmt(s.hourlyWage)}</td><td>${fmt(s.tips)}</td><td>${fmt(daily)}</td><td>${fmt(s.sales)}</td><td>${has(s.transactions)?s.transactions:'—'}</td><td>${has(s.items)?s.items:'—'}</td><td>${fmt(average)}</td><td>${fmt(expected)}</td><td class="note-cell">${note?`<button class="note-link" type="button" data-view-note="${s.id}" aria-label="View note for shift from ${s.date}">View note</button>`:'—'}</td><td class="actions-cell"><div class="row-actions"><button class="edit-row" type="button" data-edit="${s.id}" aria-label="Edit shift from ${s.date}">Edit</button><button class="delete-row" type="button" data-delete="${s.id}" aria-label="Delete shift from ${s.date}">×</button></div></td></tr>`}).join('');$('#empty-state').style.display=rows.length?'none':'block';
}

function openNote(id){
  const shift=shifts.find(row=>row.id===id);if(!shift?.notes?.trim())return;
  $('#note-dialog-title').textContent=`Shift note · ${shift.date}`;$('#note-dialog-content').textContent=shift.notes;$('#note-dialog').showModal();
}
function closeNote(){if($('#note-dialog').open)$('#note-dialog').close()}

function renderChart(){
  const rows=[...shifts].filter(s=>has(s.sales)||has(s.tips)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-12);if(!rows.length){$('#chart').innerHTML='<span class="chart-empty">Add sales or tips to see a trend.</span>';return}
  const max=Math.max(...rows.flatMap(s=>[has(s.sales)?Number(s.sales):0,has(s.tips)?Number(s.tips):0]),1);$('#chart').innerHTML=rows.map(s=>`<div class="chart-group" title="${s.date}: ${fmt(s.sales)} sales, ${fmt(s.tips)} tips"><div class="bar sales" style="height:${has(s.sales)?Math.max(2,s.sales/max*100):0}%"></div><div class="bar tips" style="height:${has(s.tips)?Math.max(2,s.tips/max*100):0}%"></div><small>${s.date.slice(5)}</small></div>`).join('');
}

function setFormValue(id,input){$(`#${id}`).value=has(input)?input:''}
function resetShiftEditor(message='Ready for your next shift.'){
  editingId=null;const wage=latestHourlyWage();$('#shift-form').reset();$('#date').value=isoToday();$('#hourly-wage').value=wage;$('#shift-submit').textContent='Save shift';$('#cancel-edit').hidden=true;$('#entry-status').textContent=message;
}
function editShift(id){
  const shift=shifts.find(row=>row.id===id);if(!shift)return;editingId=id;
  $('#date').value=shift.date;$('#pay-date').value=shift.payDate||'';setFormValue('hours',shift.hours);setFormValue('hourly-wage',shift.hourlyWage);setFormValue('tips',shift.tips);setFormValue('sales',shift.sales);setFormValue('transactions',shift.transactions);setFormValue('items',shift.items);$('#notes').value=shift.notes||'';
  $('#shift-submit').textContent='Update shift';$('#cancel-edit').hidden=false;$('#entry-status').textContent=`Editing ${shift.date}. Changes are not saved until you choose Update shift.`;showPage('log-shift');$('#entry').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#shift-form').addEventListener('submit',e=>{e.preventDefault();const sales=value('sales'),transactions=value('transactions'),metrics=['hours','hourly-wage','tips','sales','transactions','items'].map(value);if(metrics.every(v=>!has(v))&&!$('#notes').value.trim()){$('#entry-status').textContent='Add at least one shift detail before saving.';return}const wasEditing=Boolean(editingId),shift={id:editingId||crypto.randomUUID(),date:$('#date').value,payDate:$('#pay-date').value,hours:value('hours'),hourlyWage:value('hourly-wage'),tips:value('tips'),sales,transactions,items:value('items'),notes:$('#notes').value.trim()};if(wasEditing){const index=shifts.findIndex(row=>row.id===editingId);if(index>=0)shifts[index]=shift}else shifts.push(shift);save();render();resetShiftEditor(`${wasEditing?'Updated':'Saved'} ${shift.date} for pay date ${payDateLabel(shift.payDate)}.${has(sales)?` Expected commission: ${money.format(sales*RATE)}.`:''}`)});
$('#cancel-edit').addEventListener('click',()=>resetShiftEditor('Edit canceled. The saved shift was not changed.'));
$('#history-body').addEventListener('click',e=>{const noteId=e.target.dataset.viewNote;if(noteId){openNote(noteId);return}const editId=e.target.dataset.edit;if(editId){editShift(editId);return}const id=e.target.dataset.delete;if(!id)return;shifts=shifts.filter(s=>s.id!==id);if(editingId===id)resetShiftEditor('The shift being edited was deleted.');save();render()});
$('#close-note').addEventListener('click',closeNote);$('#close-note-bottom').addEventListener('click',closeNote);$('#note-dialog').addEventListener('click',e=>{if(e.target===$('#note-dialog'))closeNote()});
$('#search').addEventListener('input',renderHistory);$('#period-filter').addEventListener('change',renderHistory);$('#dashboard-pay-date').addEventListener('change',()=>{localStorage.setItem(PAY_DATE_VIEW_KEY,$('#dashboard-pay-date').value);render()});
$('#clear-all').addEventListener('click',()=>{if(shifts.length&&confirm('Clear all saved shift data from this browser?')){shifts=[];save();render();resetShiftEditor('All shift data was cleared.')}});
$('#calendar-prev').addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);calendarSelectedDate=iso(calendarCursor);renderCalendar()});
$('#calendar-next').addEventListener('click',()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);calendarSelectedDate=iso(calendarCursor);renderCalendar()});
$('#calendar-today').addEventListener('click',()=>{const today=new Date();calendarCursor=new Date(today.getFullYear(),today.getMonth(),1);calendarSelectedDate=isoToday();renderCalendar()});
$('#calendar-grid').addEventListener('click',event=>{const day=event.target.closest('[data-calendar-date]');if(!day)return;calendarSelectedDate=day.dataset.calendarDate;renderCalendar()});
$('#calendar-detail-body').addEventListener('click',event=>{const id=event.target.dataset.calendarEdit;if(id)editShift(id)});
$('#calendar-log-day').addEventListener('click',()=>{$('#date').value=$('#calendar-log-day').dataset.date||calendarSelectedDate;showPage('log-shift');$('#entry').scrollIntoView({behavior:'smooth',block:'start'})});

const PAGE_NAMES=['dashboard','calendar','log-shift','paystubs','pay-periods','trends','audit','account'];
function showPage(requested,updateAddress=true){
  const page=PAGE_NAMES.includes(requested)?requested:'dashboard';
  const grid=document.querySelector('.content-grid');
  const shiftMedia=$('#shift-media');
  const historySection=$('#history');
  if(page==='log-shift')grid.before(shiftMedia);
  else historySection.before(shiftMedia);
  document.querySelectorAll('[data-page]').forEach(section=>{
    const sectionPages=section.dataset.page.split(/\s+/);
    section.hidden=page==='dashboard'?section.hasAttribute('data-dashboard-hidden'):!sectionPages.includes(page);
  });
  grid.hidden=!['dashboard','log-shift','audit'].includes(page);grid.classList.toggle('page-mode',page!=='dashboard'&&!grid.hidden);
  document.querySelectorAll('[data-page-target]').forEach(button=>{
    const active=button.dataset.pageTarget===page;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');
  });
  if(updateAddress)history.replaceState(null,'',`#${page}`);
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-page-target]').forEach(button=>button.addEventListener('click',()=>showPage(button.dataset.pageTarget)));
window.addEventListener('hashchange',()=>showPage(location.hash.slice(1),false));
window.addEventListener('tracker:navigate',event=>showPage(event.detail));

function updateSimulator(){const sales=value('sim-sales'),rate=value('sim-rate');$('#sim-rate-output').textContent=`${rate.toFixed(1)}%`;$('#sim-result').textContent=fmt(sales*rate/100);const diff=sales*rate/100-sales*RATE;$('#sim-compare').textContent=Math.abs(diff)<.01?'Same as 1.5%':`${diff>0?'+':''}${money.format(diff)} versus 1.5%`}
$('#sim-sales').addEventListener('input',updateSimulator);$('#sim-rate').addEventListener('input',updateSimulator);
window.addEventListener('paystubs:changed',render);
window.addEventListener('tracker:data-loaded',()=>{shifts=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');editingId=null;render();resetShiftEditor('Your synced shifts are ready.')});

$('#hourly-wage').value=latestHourlyWage();updateSimulator();render();showPage(location.hash.slice(1),!PAGE_NAMES.includes(location.hash.slice(1)));
