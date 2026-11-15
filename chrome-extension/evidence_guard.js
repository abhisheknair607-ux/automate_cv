"use strict";
// Conservative, deterministic checks on AI-proposed yes/no and skills answers.
(function(root){
  const normal=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const stop=new Set(["are","have","had","has","been","does","did","you","your","the","that","this","with","from","some","any","there","they","were","where","when","what","which","please","select","option","using","used","able","experience","experienced","skills","skill","knowledge","work","working","previously","ever","current","currently","years","year","question","would","could","should","proficient","familiar","do","can"]);
  const stem=s=>s.length>5?s.replace(/(?:ing|tion|ed|es|s)$/,''):s;
  const terms=s=>[...new Set(normal(s).split(" ").filter(w=>w.length>=3&&!stop.has(w)).map(stem).filter(w=>w.length>=3))];
  const neg=/\b(?:no|not|never|without|none|haven.t|hasn.t|dont|didn.t|cannot|cant|lack|lacking)\b/i;
  function shared(label,evidence){
    const ts=terms(label),source=terms(evidence);
    return ts.length&&ts.some(t=>source.some(s=>s===t||s.startsWith(t)&&t.length>4||t.startsWith(s)&&s.length>4));
  }
  function relevantNegative(label,evidence){
    const ts=terms(label);
    for(const clause of String(evidence||"").split(/[.;\n]|\bbut\b|\bhowever\b/i)){
      if(!neg.test(clause))continue;
      if(!ts.length||shared(label,clause))return true;
    }
    return false;
  }
  function relevantPositive(label,evidence){
    return String(evidence||"").split(/[.;\n]|\bbut\b|\bhowever\b/i)
      .some(clause=>shared(label,clause)&&!neg.test(clause));
  }
  function supportsChoice(label,answer,evidence){
    const choice=normal(answer);
    if(!evidence||!shared(label,evidence))return false;
    const negative=relevantNegative(label,evidence),positive=relevantPositive(label,evidence);
    // Conflicting statements are unknown, not a reliable choice in either direction.
    if(negative&&positive)return false;
    if(choice==="yes"||choice==="true")return !negative&&positive;
    if(choice==="no"||choice==="false")return negative&&!positive;
    if(["other","none of the above","prefer not to say","decline to answer"].includes(choice))return false;
    // For named options a cited fact must explicitly name the option.
    return normal(evidence).includes(choice);
  }
  // Writing drafts may paraphrase verified evidence, but cannot introduce numbers
  // not present in their citations. Such drafts remain labelled for review.
  function supportsDraft(label,answer,evidence,maxLength){
    const value=String(answer||"").trim();
    if(!value||value.length>4000||maxLength>0&&value.length>maxLength)return false;
    if(!shared(label+" "+answer,evidence))return false;
    const numbers=normal(value).match(/\b\d+(?:\.\d+)?\b/g)||[];
    const knownNumbers=new Set(normal(evidence).match(/\b\d+(?:\.\d+)?\b/g)||[]);
    if(numbers.some(n=>!knownNumbers.has(n)))return false;
    const claimed=terms(value),known=terms(evidence);
    if(!claimed.length||!known.length)return false;
    const matched=claimed.filter(word=>known.some(x=>x===word||
      x.startsWith(word)&&word.length>4||word.startsWith(x)&&x.length>4)).length;
    return matched>=2&&matched/claimed.length>=0.45;
  }
  const api={supportsChoice,supportsDraft,relevantNegative,terms};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.GaramaalEvidenceGuard=api;
})(globalThis);
