"use strict";
// Standard job-application acknowledgements only. This does not express a blanket
// willingness to make factual declarations, waive rights or receive marketing.
(function(root){
  const normal=value=>String(value||"").replace(/\s+/g," ").trim().toLowerCase();
  const exclude=/\b(?:don.t agree|do not agree|decline|refuse|opt out|marketing|advertis(?:ing|ements?)|promotional?|newsletter|mailing list|sales offers|sms|text messages?|contact me about offers|third.party marketing|future vacancies|talent pool|arbitration|non.compete|waiv(?:e|er)|release of claims|background check|drug test|credit check|polygraph|medical examination|criminal|convict|arrest|sanction|conflict of interest|relatives?|family members?|government employ|sponsor|visa|work authorization|work authorisation|citizenship|age of majority|over 18|at least 18|disabled|disability|veteran|eligible to work|i am authorized|i am authorised|referees?|reference check|truthful|true and correct|accurate and complete|complete and accurate|certify|declare|confirm that|hereby swear|perjury|all information|every answer|i have reviewed|i have checked)\b/i;
  // Terms, privacy notices and candidate-data processing are appropriate for the
  // configured one-click policy only; the applicant still reviews before proceeding.
  const target=/\b(?:terms(?:\s+(?:and|&)\s+conditions|\s+of\s+(?:use|service))?|conditions of use|privacy\s+(?:policy|notice|statement)|data\s+(?:privacy|protection|processing)\s+(?:notice|policy|statement|terms)|candidate privacy|applicant privacy|personal data\s+(?:processing|collection|handling|for recruitment)|personal information\s+(?:processing|collection|handling|for recruitment)|recruitment (?:data|privacy|processing)|processing (?:my|your|of my|of your) (?:personal )?(?:data|information)|application data handling|(?:processing|collection|handling) of (?:my\s+|your\s+|the\s+)?(?:personal\s+)?(?:data|information))\b/i;
  const action=/\b(?:i\s+(?:agree|accept|consent|acknowledge|understand|have read)|agree|accept|consent|acknowledge|i\s+understand|i\s+have\s+read)\b/i;
  function classify(field){
    if(!field||field.type!=="checkbox"||field.hasValue)return {kind:"not-applicable"};
    const label=normal(String(field.label||"").split(" | ")[0]);
    const context=normal(field.context||field.section||"");
    const text=label||context;
    if(!text)return {kind:"review",reason:"Unlabelled agreement"};
    if(exclude.test(text))return {kind:"review",reason:"Separate declaration or optional permission"};
    if(!action.test(text)&&!(field.required&&/\bconsent\b/.test(text)))
      return {kind:"review",reason:"No explicit agreement intent"};
    if(target.test(text)||/^(?:i\s+)?(?:agree|accept|acknowledge|consent)(?:\s+to|\s+that)?\s*\.?$/.test(text)&&target.test(context))
      return {kind:"standard",reason:"Terms or recruitment privacy acknowledgement"};
    return {kind:"review",reason:"Agreement subject is not established"};
  }
  function suggest(field){
    if(classify(field).kind!=="standard")return null;
    return {id:field.id,fieldType:"checkbox",label:field.label,
      value:"true",displayValue:"Checked — review before continuing",agreement:true,
      source:"Auto-checked a standard terms/privacy acknowledgement. Review it before continuing."};
  }
  const api={classify,suggest};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalConsent=api;
})(globalThis);
