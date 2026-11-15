const test=require('node:test');
const assert=require('node:assert/strict');
const {numberedSection,periodDates,directProfileAnswers}=require('../autofill_profile_sections');
const profile={
  work:[
    {employer:'TaxLink',title:'Tax Client Manager',period:'2026-06 — Present'},
    {employer:'EY India',title:'Business Analyst',period:'2022-06 — 2025-07'}
  ],
  education:[
    {institution:'University College Dublin',qualification:'MSc in Financial Data Science',period:'2025-08 — 2026-09',grade:'3.5/4.2'},
    {institution:'Mumbai University',qualification:'Bachelors in Commerce',period:'2019-05 — 2022-03',grade:'9.26/10'}
  ]
};
const field=(id,context,label,type='text',extra={})=>({id:'gm-autofill-'+id,context,label,type,options:[],...extra});
test('numbered sections identify one record and reject ambiguous unnumbered groups',()=>{
  assert.deepEqual(numberedSection(field(1,'Professional Experience (2)','Employer')),{kind:'work',index:1});
  assert.deepEqual(numberedSection(field(2,'University Education 1','Institution')),{kind:'education',index:0});
  assert.equal(numberedSection(field(3,'Work Experience','Employer')),null);
});
test('explicit work and education facts map to their own numbered sections',()=>{
  const fields=[field(1,'Professional Experience (1)','Employer'),
    field(2,'Professional Experience (2)','Title'),
    field(3,'Education (1)','Institution'),
    field(4,'Education (2)','Grade'),
    field(5,'Professional Experience','Employer')];
  const answers=directProfileAnswers(fields,profile);
  assert.deepEqual(answers.map(x=>x.answer),['TaxLink','Business Analyst','University College Dublin','9.26/10']);
  assert.deepEqual(answers.map(x=>x.evidenceIds[0]),[
    'profile:work:1:employer','profile:work:2:title',
    'profile:education:1:institution','profile:education:2:grade']);
});
test('month and year use exact available values; absent days and current end stay blank',()=>{
  assert.deepEqual(periodDates('2022-06 — 2025-07').end,{year:'2025',month:7});
  const fields=[
    field(1,'Professional Experience (2)','Start Date (Month / Day / Year)','select',{
      datePart:'month',options:[{label:'Select',value:''},{label:'June',value:'Jun'}]}),
    field(2,'Professional Experience (2)','Start Date (Month / Day / Year)','text',{datePart:'year'}),
    field(3,'Professional Experience (2)','Start Date (Month / Day / Year)','select',{
      datePart:'day',options:[{label:'1',value:'1'}]}),
    field(4,'Professional Experience (1)','End Date (Month / Day / Year)','text',{datePart:'year'}),
    field(5,'Education (2)','Graduation Date (Month / Day / Year)','select',{
      datePart:'month',options:[{label:'March',value:'03',disabled:true}]}),
    field(6,'Education (2)','Graduation Date (Month / Day / Year)','text',{datePart:'year'})
  ];
  assert.deepEqual(directProfileAnswers(fields,profile).map(x=>[x.fieldId,x.answer]),[
    ['gm-autofill-1','Jun'],['gm-autofill-2','2022'],['gm-autofill-6','2022']]);
});

test('structured month fields take precedence over a legacy date summary',()=>{
  const edited={work:[{employer:'Example',period:'2020-01 ? 2021-01',startDate:'2022-06',endDate:'2025-07'}]};
  const fields=[field(1,'Experience (1)','Start Date (Month / Day / Year)','text',{datePart:'year'}),
    field(2,'Experience (1)','End Date (Month / Day / Year)','text',{datePart:'year'})];
  assert.deepEqual(directProfileAnswers(fields,edited).map(x=>x.answer),['2022','2025']);
});

test('numbered work locations and explicit present status use the matching record',()=>{
  const records={work:[
    {employer:'TaxLink',city:'Dublin',country:'Ireland',period:'2026-06 ? Present'},
    {employer:'EY India',city:'Mumbai',country:'India',period:'2022-06 ? 2025-07'}]};
  const fields=[field(1,'Professional Experience (1)','City'),
    field(2,'Professional Experience (2)','Country','select',{
      options:[{label:'Select',value:''},{label:'India',value:'IN'}]}),
    field(3,'Professional Experience (1)','Current employer','checkbox'),
    field(4,'Professional Experience (2)','Current employer','checkbox')];
  assert.deepEqual(directProfileAnswers(fields,records).map(x=>x.answer),['Dublin','IN','true']);
});

test('explicit current status works without a legacy period and no never checks the box',()=>{
  const records={work:[{employer:'Example',current:'yes',startDate:'2026-06',endDate:''},
    {employer:'Older',current:'no',period:'2020-01 to Present'}]};
  const fields=[field(1,'Experience (1)','Current employer','checkbox'),
    field(2,'Experience (2)','Current employer','checkbox')];
  assert.deepEqual(directProfileAnswers(fields,records).map(x=>x.fieldId),['gm-autofill-1']);
});
