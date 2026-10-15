const STORAGE_KEY='keepRichShiftsV2',PAYSTUB_KEY='keepRichPaystubsV1',PAY_DATE_VIEW_KEY='keepRichPayDateViewV1',HISTORY_PAGE_SIZE=10,financial=window.KeepRichFinancialModel,RATE=financial.COMMISSION_RATE;
const PREVIEW_MODE=['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('preview'),money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}),compactMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}),shortDate=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}),longDate=new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}),monthName=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}),$=s=>document.querySelector(s),isoToday=()=>new Date().toISOString().slice(0,10);
let shifts=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'),editingId=null,historyPage=1,calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarSelectedDate=isoToday();
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
function numericPayDate(dateString){if(!dateString)return'—';const[year,month,day]=dateString.split('-');return year&&month&&day?`${month}-${day}-${year}`:dateString}
function dashboardRows(){const selected=$('#dashboard-pay-date').value;if(selected==='unassigned')return shifts.filter(s=>!s.payDate);if(selected!=='all')return shifts.filter(s=>s.payDate===selected);const stubDates=new Set(savedPaystubs().map(stub=>stub.payDate).filter(Boolean));return stubDates.size?shifts.filter(shift=>stubDates.has(shift.payDate)):shifts}

function savedPaystubs(){try{const rows=JSON.parse(localStorage.getItem(PAYSTUB_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return[]}}
function dashboardPaystubs(){const selected=$('#dashboard-pay-date').value,rows=savedPaystubs();return selected==='all'?rows:selected==='unassigned'?[]:rows.filter(stub=>stub.payDate===selected)}
function paystubAudits(){return savedPaystubs().map(stub=>{const assigned=financial.matchShiftsToPaystub(stub,shifts),summary=financial.summarizeSelection([stub],assigned);return{...stub,sales:summary.sales,expected:summary.expectedCommission,actual:summary.actualCommission,difference:summary.commissionDifference,status:summary.status}})}

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
  const records=paystubAudits(),complete=records.length>0&&records.every(row=>has(row.difference)),expected=sumKnown(records,'expected'),actual=sumKnown(records,'actual'),difference=complete?financial.roundMoney(actual-expected):null;
  $('#audit-expected').textContent=fmt(expected);$('#audit-paid').textContent=fmt(actual);$('#audit-difference').textContent=has(difference)?`${difference>=0?'+':''}${money.format(difference)}`:'—';$('#audit-difference').className=has(difference)?(difference>=-.01?'good':'bad'):'missing';
  $('#audit-message').textContent=!records.length?'Save a paystub to compare expected and paid commission.':!complete?'Incomplete: every matched shift needs a sales value and every paystub needs a commission amount.':Math.abs(difference)<.01?'Saved paystubs match the expected 1.5%.':difference<0?`Saved paystubs may be short ${money.format(Math.abs(difference))}.`:`Saved paystubs are ${money.format(difference)} above 1.5%.`;
  $('#audit-period-body').innerHTML=records.map(row=>`<tr><td>${payDateLabel(row.payDate)}</td><td>${fmt(row.sales)}</td><td>${fmt(row.expected)}</td><td>${fmt(row.actual)}</td><td class="${has(row.difference)?(row.difference>=-.01?'good':'bad'):'missing'}">${has(row.difference)?`${row.difference>=0?'+':''}${money.format(row.difference)}`:'Incomplete'}</td></tr>`).join('')||'<tr><td colspan="5" class="missing">No saved paystubs yet.</td></tr>';
}

function render(){
  renderPayDateOptions();
  const rows=dashboardRows(),paystubs=dashboardPaystubs(),verified=financial.summarizeSelection(paystubs,rows),provisional=financial.provisionalShiftSummary(rows),hasStub=verified.hasPaystub,sales=hasStub?verified.sales:provisional.sales,tips=hasStub?verified.tips:provisional.tips,expected=hasStub?verified.expectedCommission:provisional.expected,actual=hasStub?verified.actualCommission:null,difference=hasStub?verified.commissionDifference:null;
  const totalEarnings=hasStub?verified.grossWithTips:provisional.provisionalGrossWithTips,averageHourly=hasStub?verified.effectiveGrossHourly:has(totalEarnings)&&has(provisional.loggedHours)&&provisional.loggedHoursComplete&&provisional.loggedHours>0?financial.roundMoney(totalEarnings/provisional.loggedHours):null;
  $('#stat-sales').textContent=fmt(sales);$('#stat-tips').textContent=fmt(tips);$('#stat-commission').textContent=fmt(actual);$('#stat-earnings').textContent=fmt(totalEarnings);$('#stat-hourly').textContent=fmt(averageHourly);
  const selectedPayDate=$('#dashboard-pay-date').value;
  $('#period-label').textContent=selectedPayDate==='all'?'All recorded shifts':selectedPayDate==='unassigned'?'Pay date unassigned':`Pay date ${payDateLabel(selectedPayDate)}`;
  $('#schedule-note').textContent='Grouped only by the paycheck date saved on each shift';
  $('#tip-rate').textContent=has(sales)&&has(tips)&&sales>0?`${(tips/sales*100).toFixed(1)}% of sales`:verified.tipsComplete?'Recorded shift tips':'Some tip values are unknown';
  $('#commission-delta').textContent=has(difference)?`${difference>=0?'+':''}${money.format(difference)} vs expected`:actual===null?'From saved paystubs':'Audit needs matching sales';
  $('#commission-delta').className=has(difference)?(difference>=-.01?'good':'bad'):'missing';
  renderAudit();renderSummary();renderHistory();renderChart();renderCalendar();
}

function renderSummary(){
  const stubs=savedPaystubs(),keys=[...new Set([...shifts.map(shift=>shift.payDate||'unassigned'),...stubs.map(stub=>stub.payDate).filter(Boolean)])].sort((a,b)=>b.localeCompare(a));
  $('#summary-body').innerHTML=keys.map(key=>{const rows=key==='unassigned'?shifts.filter(shift=>!shift.payDate):shifts.filter(shift=>shift.payDate===key),periodStubs=stubs.filter(stub=>stub.payDate===key),summary=financial.summarizeSelection(periodStubs,rows),provisional=financial.provisionalShiftSummary(rows),status=periodStubs.length?(summary.status==='verified'?'Verified':summary.status==='difference'?'Difference found':'Incomplete data'):'Provisional';return`<tr><td>${key==='unassigned'?'Unassigned':payDateLabel(key)}</td><td>${numFmt(summary.payrollHours)}</td><td>${numFmt(summary.loggedHours)}</td><td>${has(summary.hoursDiscrepancy)?`Discrepancy ${numFmt(summary.hoursDiscrepancy)}`:numFmt(summary.otherHours)}</td><td>${fmt(periodStubs.length?summary.sales:provisional.sales)}</td><td>${fmt(periodStubs.length?summary.tips:provisional.tips)}</td><td>${fmt(periodStubs.length?summary.expectedCommission:provisional.expected)}</td><td>${fmt(summary.gross)}</td><td>${fmt(summary.grossWithTips)}</td><td class="${summary.status}">${status}</td></tr>`}).join('')||'<tr><td colspan="10">No shifts or paystubs saved yet.</td></tr>';
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
  const rows=filtered(),pageCount=Math.max(1,Math.ceil(rows.length/HISTORY_PAGE_SIZE));historyPage=Math.min(Math.max(historyPage,1),pageCount);const start=(historyPage-1)*HISTORY_PAGE_SIZE,pageRows=rows.slice(start,start+HISTORY_PAGE_SIZE);
  $('#history-body').innerHTML=pageRows.map(s=>{const expected=has(s.sales)?Number(s.sales)*RATE:null,average=has(s.sales)&&has(s.transactions)&&Number(s.transactions)>0?Number(s.sales)/Number(s.transactions):null,daily=shiftEarnings(s),note=s.notes?.trim();return`<tr><td>${s.date?shortDate.format(asDate(s.date)):'—'}</td><td>${numericPayDate(s.payDate)}</td><td>${numFmt(s.hours)}</td><td>${fmt(s.hourlyWage)}</td><td>${fmt(s.tips)}</td><td>${fmt(daily)}</td><td>${fmt(s.sales)}</td><td>${has(s.transactions)?s.transactions:'—'}</td><td>${has(s.items)?s.items:'—'}</td><td>${fmt(average)}</td><td>${fmt(expected)}</td><td class="note-cell">${note?`<button class="note-link" type="button" data-view-note="${s.id}" aria-label="View note for shift from ${s.date}">View note</button>`:'—'}</td><td class="actions-cell"><div class="row-actions"><button class="edit-row" type="button" data-edit="${s.id}" aria-label="Edit shift from ${s.date}">Edit</button><button class="delete-row" type="button" data-delete="${s.id}" aria-label="Delete shift from ${s.date}">×</button></div></td></tr>`}).join('');
  $('#empty-state').style.display=rows.length?'none':'block';$('#history-pagination').hidden=rows.length<=HISTORY_PAGE_SIZE;$('#history-page-status').textContent=`Page ${historyPage} of ${pageCount} · ${rows.length} entries`;$('#history-prev').disabled=historyPage===1;$('#history-next').disabled=historyPage===pageCount;
}

function openNote(id){
  const shift=shifts.find(row=>row.id===id);if(!shift?.notes?.trim())return;
  $('#note-dialog-title').textContent=`Shift note · ${shift.date}`;$('#note-dialog-content').textContent=shift.notes;$('#note-dialog').showModal();
}
function closeNote(){if($('#note-dialog').open)$('#note-dialog').close()}

function renderChart(){
  const paidByDate=new Map(),salesByDate=new Map();
  savedPaystubs().forEach(stub=>{if(stub.payDate&&has(stub.commission))paidByDate.set(stub.payDate,(paidByDate.get(stub.payDate)||0)+Number(stub.commission))});
  shifts.forEach(shift=>{if(shift.payDate&&has(shift.sales))salesByDate.set(shift.payDate,(salesByDate.get(shift.payDate)||0)+Number(shift.sales))});
  const chartRows=shifts.map(shift=>{const wages=has(shift.hours)&&has(shift.hourlyWage)?Number(shift.hours)*Number(shift.hourlyWage):null,paid=paidByDate.get(shift.payDate),periodSales=salesByDate.get(shift.payDate),commission=has(paid)&&has(shift.sales)&&periodSales>0?paid*Number(shift.sales)/periodSales:null;return{...shift,wages,commission}});
  const rows=chartRows.filter(row=>[row.sales,row.tips,row.wages,row.commission].some(has)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-12);if(!rows.length){$('#chart').innerHTML='<span class="chart-empty">Add sales, tips, wages, or a matching paystub to see a trend.</span>';return}
  const max=Math.max(...rows.flatMap(row=>[row.sales,row.tips,row.wages,row.commission].filter(has).map(Number)),1);$('#chart').innerHTML=rows.map(row=>`<div class="chart-group" title="${row.date}: ${fmt(row.sales)} sales, ${fmt(row.tips)} tips, ${fmt(row.wages)} wages, ${fmt(row.commission)} commission"><div class="bar sales" style="height:${has(row.sales)?Math.max(2,row.sales/max*100):0}%"></div><div class="bar tips" style="height:${has(row.tips)?Math.max(2,row.tips/max*100):0}%"></div><div class="bar wages" style="height:${has(row.wages)?Math.max(2,row.wages/max*100):0}%"></div><div class="bar commission" style="height:${has(row.commission)?Math.max(2,row.commission/max*100):0}%"></div><small>${row.date.slice(5)}</small></div>`).join('');
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
$('#shift-form').addEventListener('submit',e=>{e.preventDefault();const sales=value('sales'),transactions=value('transactions'),metrics=['hours','hourly-wage','tips','sales','transactions','items'].map(value);if(metrics.every(v=>!has(v))&&!$('#notes').value.trim()){$('#entry-status').textContent='Add at least one shift detail before saving.';return}const wasEditing=Boolean(editingId),shift={id:editingId||crypto.randomUUID(),date:$('#date').value,payDate:$('#pay-date').value,hours:value('hours'),hourlyWage:value('hourly-wage'),tips:value('tips'),sales,transactions,items:value('items'),notes:$('#notes').value.trim()};if(wasEditing){const index=shifts.findIndex(row=>row.id===editingId);if(index>=0)shifts[index]=shift}else shifts.push(shift);historyPage=1;save();render();resetShiftEditor(`${wasEditing?'Updated':'Saved'} ${shift.date} for pay date ${payDateLabel(shift.payDate)}.${has(sales)?` Expected commission: ${money.format(sales*RATE)}.`:''}`)});
$('#cancel-edit').addEventListener('click',()=>resetShiftEditor('Edit canceled. The saved shift was not changed.'));
$('#history-body').addEventListener('click',e=>{const noteId=e.target.dataset.viewNote;if(noteId){openNote(noteId);return}const editId=e.target.dataset.edit;if(editId){editShift(editId);return}const id=e.target.dataset.delete;if(!id)return;shifts=shifts.filter(s=>s.id!==id);if(editingId===id)resetShiftEditor('The shift being edited was deleted.');save();render()});
$('#close-note').addEventListener('click',closeNote);$('#close-note-bottom').addEventListener('click',closeNote);$('#note-dialog').addEventListener('click',e=>{if(e.target===$('#note-dialog'))closeNote()});
const resetHistoryPage=()=>{historyPage=1;renderHistory()};
$('#search').addEventListener('input',resetHistoryPage);$('#period-filter').addEventListener('change',resetHistoryPage);$('#history-prev').addEventListener('click',()=>{if(historyPage>1){historyPage-=1;renderHistory()}});$('#history-next').addEventListener('click',()=>{historyPage+=1;renderHistory()});$('#dashboard-pay-date').addEventListener('change',()=>{localStorage.setItem(PAY_DATE_VIEW_KEY,$('#dashboard-pay-date').value);render()});
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
  document.querySelector('.app-shell').dataset.currentPage=page;
  document.querySelectorAll('[data-page]').forEach(section=>{
    const sectionPages=section.dataset.page.split(/\s+/);
    section.hidden=page==='dashboard'?section.hasAttribute('data-dashboard-hidden'):!sectionPages.includes(page);
  });
  grid.classList.toggle('page-mode',page!=='dashboard');
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
window.addEventListener('tracker:data-loaded',()=>{shifts=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');editingId=null;historyPage=1;render();resetShiftEditor('Your synced shifts are ready.')});

$('#hourly-wage').value=latestHourlyWage();updateSimulator();render();showPage(location.hash.slice(1),!PAGE_NAMES.includes(location.hash.slice(1)));
