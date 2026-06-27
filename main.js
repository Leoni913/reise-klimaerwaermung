"use strict";

const DATA_DIR = "./data/";

async function loadJSON(filename) {
  const response = await fetch(DATA_DIR + filename);
  if (!response.ok) {
    throw new Error(`${filename} konnte nicht geladen werden (${response.status})`);
  }
  return response.json();
}

function showDataError(error) {
  console.error(error);
  const box = document.createElement("div");
  box.className = "data-error";
  box.innerHTML = `<strong>Daten konnten nicht geladen werden.</strong><br>${error.message}<br><small>Prüfe, ob der Ordner <code>data/</code> im GitHub-Repository liegt und ob die Dateinamen exakt stimmen.</small>`;
  document.body.prepend(box);
}

async function boot() {
  try {
    const [
      gistempAnnual,
      emissionsData,
      worldTopology,
      num2isoMap,
      countryNames,
      population2023,
      projectionData
    ] = await Promise.all([
      loadJSON("gistemp_annual.json"),
      loadJSON("ghg_emissions.json"),
      loadJSON("world_topology.json"),
      loadJSON("num2iso.json"),
      loadJSON("country_names.json"),
      loadJSON("population_2023_million.json"),
      loadJSON("projections_temperature_compact.json")
    ]);

    const TEMP = gistempAnnual
      .filter(d => d.year != null && d.anomaly_c != null)
      .map(d => [+d.year, +d.anomaly_c])
      .sort((a, b) => a[0] - b[0]);

    const EMISSIONS = emissionsData
      .filter(d => d.iso && d.year != null && d.emissions != null)
      .map(d => ({
        iso: d.iso,
        country: d.country,
        unit: d.unit || "MtCO2e",
        year: +d.year,
        emissions: +d.emissions
      }));

    const WORLD = worldTopology;
    const NUM2ISO = num2isoMap;
    const NAMES = countryNames;
    const POP = population2023;
    const PROJ = projectionData;

    // Bereinigte Ländernamen: blendet technische/ungeklärte Kürzel wie CYN, ATC usw. aus.
    function cleanCountryName(iso) {
      const name = NAMES[iso];
      if (!name || typeof name !== "string") return null;
      const trimmed = name.trim();
      if (!trimmed || /^[A-Z0-9]{3}$/.test(trimmed)) return null;
      return trimmed;
    }

    const byYear=new Map(TEMP);
    const FIRST=TEMP[0][0],LAST=TEMP[TEMP.length-1][0];
    const stripeColor=d3.scaleDiverging(t=>d3.interpolateRdBu(1-t)).domain([-0.5,0.3,1.3]);
    const de=(n,dec=1)=>(n>=0?"+":"\u2212")+Math.abs(n).toFixed(dec).replace(".",",");
    const num=(n,dec=1)=>n.toFixed(dec).replace(".",",");
    const tip=document.getElementById("tip");
    /* Pro-Kopf in tCO₂e/Kopf = MtCO₂e / Bevölkerung in Mio. */
    function perCapita(iso,mt){const p=POP[iso];return (p&&p>0)?mt/p:null;}
    /* PROLOG */
    const yearInput=document.getElementById("year"),goBtn=document.getElementById("go"),
          presult=document.getElementById("presult"),pstripes=d3.select("#pstripes");
    yearInput.addEventListener("input",()=>{const v=+yearInput.value;goBtn.disabled=!(v>=FIRST&&v<=LAST);});
    yearInput.addEventListener("keydown",e=>{if(e.key==="Enter"&&!goBtn.disabled)revealProlog();});
    goBtn.addEventListener("click",revealProlog);
    function revealProlog(){
      const birth=+yearInput.value,delta=byYear.get(LAST)-byYear.get(birth),years=LAST-birth;
      drawPrologStripes(birth);
      document.getElementById("delta").textContent=de(delta);
      let sentence;
      if (years === 0) {
        sentence = "Dein Geburtsjahr <b>"+birth+"</b> ist der aktuellste Datenpunkt in dieser Darstellung. Deshalb gibt es noch keine Veränderung innerhalb deiner Lebenszeit. Entscheidend ist der langfristige Trend: Die letzten Jahre gehören zu den <b>wärmsten seit Beginn der Messungen</b>.";
      } else if (delta < 0) {
        sentence = "Seit deinem Geburtsjahr <b>"+birth+"</b> liegt der aktuellste Jahreswert um <b>"+de(delta)+"&nbsp;°C</b> niedriger. Das ist eine kurzfristige Jahresschwankung — der langfristige Trend zeigt trotzdem klar nach oben.";
      } else {
        const childWord = years<=1 ? "Ein heute geborenes Kind könnte eine Welt erleben, die <b>2 bis 3&nbsp;°C wärmer</b> ist als heute."
          : "Die letzten zehn Jahre waren die <b>wärmsten seit Beginn der Messungen</b> — und sie fielen alle in deine Lebenszeit.";
        sentence = "In den <b>"+years+" Jahren</b> deines Lebens ist die globale Durchschnitts&shy;temperatur um <b>"+de(delta).replace("+","")+"&nbsp;°C</b> gestiegen — gegenüber deinem Geburtsjahr <b>"+birth+"</b>. "+childWord;
      }
      document.getElementById("sentence").innerHTML=sentence;
      presult.classList.add("on");
      buildLifePath(birth);
    }
    function buildLifePath(birth){
      const bv=byYear.get(birth), nv=byYear.get(LAST);
      /* Projektionen (hohe Emissionen) als Abweichung zum Mittel 1951\u20131980 \u2014 illustrativ */
      const nodes=[
        {yr:birth,val:bv,tag:"Geburt",future:false},
        {yr:LAST,val:nv,tag:"Heute",future:false},
        {yr:2050,val:2.1,tag:"Projektion",future:true},
        {yr:2080,val:3.3,tag:"Projektion",future:true}
      ];
      const t=document.getElementById("lpTrack");t.innerHTML="";
      nodes.forEach(n=>{
        const c=stripeColor(n.val);
        const d=document.createElement("div");
        d.className="lp-node"+(n.future?" future":"");
        d.innerHTML='<div class="yr">'+n.yr+'</div>'+
          '<div class="dot" style="background:'+c+';box-shadow:0 0 22px '+c+'66"></div>'+
          '<div class="val" style="color:'+c+'">'+de(n.val)+'\u00B0</div>'+
          '<div class="tag">'+n.tag+'</div>';
        t.appendChild(d);
      });
      document.getElementById("lifepath").classList.add("on");
    }
    /* Animierter Klimastreifen-Hintergrund im Hero (gesamte Messreihe) */
    function drawHeroStripes(){
      const stops=TEMP.map((d,i)=>stripeColor(d[1])+" "+((i/(TEMP.length-1))*100).toFixed(2)+"%");
      document.getElementById("herostripes").style.backgroundImage="linear-gradient(90deg,"+stops.join(",")+")";
    }
    drawHeroStripes();
    function drawPrologStripes(birth){
      const W=1000,H=600;pstripes.attr("viewBox","0 0 "+W+" "+H).selectAll("*").remove();
      const span=TEMP.filter(d=>d[0]>=birth);
      const x=d3.scaleBand().domain(span.map(d=>d[0])).range([0,W]).padding(0);
      pstripes.classed("on",true);
      pstripes.selectAll("rect").data(span).join("rect").attr("x",d=>x(d[0])).attr("y",0).attr("width",x.bandwidth()+1).attr("height",H).attr("fill",d=>stripeColor(d[1])).attr("opacity",0).transition().duration(900).delay((d,i)=>i*(700/span.length)).attr("opacity",1);
    }

    /* AKT 1 */
    function drawTempChart(){
      const svg=d3.select("#chart-temp");if(!svg.selectAll("*").empty())return;
      const W=1100,H=460,m={t:20,r:30,b:40,l:50};
      const x=d3.scaleLinear().domain([FIRST,LAST]).range([m.l,W-m.r]);
      const y=d3.scaleLinear().domain([-0.6,1.4]).range([H-m.b,m.t]);
      svg.append("g").attr("class","grid").attr("transform","translate("+m.l+",0)").call(d3.axisLeft(y).tickSize(-(W-m.l-m.r)).tickFormat("")).select(".domain").remove();
      svg.append("g").attr("class","axis").attr("transform","translate(0,"+(H-m.b)+")").call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));
      svg.append("g").attr("class","axis").attr("transform","translate("+m.l+",0)").call(d3.axisLeft(y).tickFormat(d=>de(d)).ticks(6));
      svg.append("line").attr("class","baseline").attr("x1",m.l).attr("x2",W-m.r).attr("y1",y(0)).attr("y2",y(0));
      const grad=svg.append("defs").append("linearGradient").attr("id","tg").attr("x1",0).attr("y1",0).attr("x2",0).attr("y2",1);
      grad.append("stop").attr("offset","0%").attr("stop-color","var(--rot)").attr("stop-opacity",.35);
      grad.append("stop").attr("offset","100%").attr("stop-color","var(--rot)").attr("stop-opacity",0);
      const area=d3.area().x(d=>x(d[0])).y0(y(0)).y1(d=>y(d[1])).curve(d3.curveMonotoneX);
      svg.append("path").datum(TEMP).attr("fill","url(#tg)").attr("d",area);
      const line=d3.line().x(d=>x(d[0])).y(d=>y(d[1])).curve(d3.curveMonotoneX);
      const path=svg.append("path").datum(TEMP).attr("class","tline").attr("d",line);
      const len=path.node().getTotalLength();
      path.attr("stroke-dasharray",len+" "+len).attr("stroke-dashoffset",len).transition().duration(2200).ease(d3.easeCubicInOut).attr("stroke-dashoffset",0);
      svg.append("circle").attr("cx",x(LAST)).attr("cy",y(byYear.get(LAST))).attr("r",4).attr("fill","var(--rot)").attr("opacity",0).transition().delay(2200).duration(400).attr("opacity",1);
      svg.append("text").attr("x",x(LAST)).attr("y",y(byYear.get(LAST))-12).attr("text-anchor","end").attr("fill","var(--ink)").attr("font-size",13).attr("font-weight",600).text(LAST+": "+de(byYear.get(LAST))+" \u00B0C").attr("opacity",0).transition().delay(2200).duration(400).attr("opacity",1);
      svg.append("rect").attr("x",m.l).attr("y",m.t).attr("width",W-m.l-m.r).attr("height",H-m.t-m.b).attr("fill","transparent").on("mousemove",function(ev){const yr=Math.round(x.invert(d3.pointer(ev,svg.node())[0]));if(!byYear.has(yr))return;tip.innerHTML="<b>"+yr+"</b> &nbsp; "+de(byYear.get(yr))+" \u00B0C";tip.style.left=(ev.clientX+14)+"px";tip.style.top=(ev.clientY-10)+"px";tip.style.opacity=1;}).on("mouseleave",()=>tip.style.opacity=0);
      /* Ereignis-Marker */
      const EVENTS=[
        [1958,"Mauna-Loa-Messreihe","Charles Keeling beginnt, die CO\u2082-Konzentration kontinuierlich zu messen \u2014 die ber\u00FChmte \u201EKeeling-Kurve\u201C entsteht."],
        [1988,"Gr\u00FCndung des IPCC","Die Vereinten Nationen rufen den Weltklimarat ins Leben, um den Forschungsstand zur Erderw\u00E4rmung zu b\u00FCndeln."],
        [1997,"Kyoto-Protokoll","Erstmals verpflichten sich Industriestaaten v\u00F6lkerrechtlich zur Reduktion ihrer Treibhausgase."],
        [2015,"Pariser Klimaabkommen","195 Staaten beschlie\u00DFen, die Erw\u00E4rmung deutlich unter 2&nbsp;\u00B0C \u2014 m\u00F6glichst auf 1,5&nbsp;\u00B0C \u2014 zu begrenzen."],
        [2024,"W\u00E4rmstes Jahr","2024 wird das hei\u00DFeste je gemessene Jahr und durchbricht erstmals die 1,5-\u00B0C-Marke gegen\u00FCber vorindustrieller Zeit."]
      ];
      const eg=svg.append("g");
      EVENTS.forEach(e=>{const yr=e[0];if(!byYear.has(yr))return;const px=x(yr),py=y(byYear.get(yr));
        eg.append("line").attr("class","evt-line").attr("x1",px).attr("x2",px).attr("y1",py).attr("y2",H-m.b);
        eg.append("text").attr("class","evt-label").attr("x",px).attr("y",py-14).attr("text-anchor","middle").text(yr).attr("opacity",0).transition().delay(2400).duration(500).attr("opacity",1);
        eg.append("circle").attr("class","evt-dot").attr("cx",px).attr("cy",py).attr("r",0)
          .on("mouseenter",function(ev){d3.select(this).attr("r",7);tip.innerHTML="<b style='color:var(--ink)'>"+yr+" \u00B7 "+e[1]+"</b><br><span style='display:block;max-width:240px;margin-top:4px;color:#c2d2e2;font-weight:300'>"+e[2]+"</span>";tip.style.opacity=1;})
          .on("mousemove",function(ev){tip.style.left=(ev.clientX+14)+"px";tip.style.top=(ev.clientY-10)+"px";})
          .on("mouseleave",function(){d3.select(this).attr("r",5);tip.style.opacity=0;})
          .transition().delay(2400).duration(500).attr("r",5);
      });
      drawStripeStrip();
    }
    /* Warming Stripes: ein Streifen je Jahr, ohne Achsen */
    function drawStripeStrip(){
      const svg=d3.select("#chart-stripes");if(!svg.selectAll("*").empty())return;
      const W=1100,H=70;const x=d3.scaleBand().domain(TEMP.map(d=>d[0])).range([0,W]).padding(0);
      svg.selectAll("rect").data(TEMP).join("rect")
        .attr("x",d=>x(d[0])).attr("y",0).attr("width",x.bandwidth()+1).attr("height",H)
        .attr("fill",d=>stripeColor(d[1])).attr("opacity",0)
        .transition().duration(700).delay((d,i)=>i*(900/TEMP.length)).attr("opacity",1);
    }

    /* AKT 2 (offline) */
    let mapInit=false,mapData=null,emByYearIso=null,playTimer=null,colTotal=null,colPer=null,mapMode="total";
    /* gibt den im aktuellen Modus relevanten Wert zur\u00FCck */
    function modeVal(iso,mt){return mapMode==="per"?perCapita(iso,mt):mt;}
    function curScale(){return mapMode==="per"?colPer:colTotal;}
    function initMap(){
      if(mapInit)return;mapInit=true;
      try{
        mapData=topojson.feature(WORLD,WORLD.objects.countries).features;
        emByYearIso=d3.rollup(EMISSIONS,v=>v[0].emissions,d=>d.year,d=>d.iso);
        const totVals=EMISSIONS.map(d=>d.emissions).filter(v=>v>0);
        const perVals=EMISSIONS.map(d=>perCapita(d.iso,d.emissions)).filter(v=>v!=null&&v>0);
        colTotal=d3.scaleSequentialLog(d3.interpolateYlOrRd).domain([d3.min(totVals),d3.max(totVals)]);
        colPer=d3.scaleSequentialLog(d3.interpolateYlOrRd).domain([d3.min(perVals),d3.quantile(perVals.sort(d3.ascending),0.985)]);
        drawMapBase();drawLegend();updateMap(+document.getElementById("yearSlider").value);
      }catch(err){document.getElementById("mapStatus").textContent="Karte konnte nicht initialisiert werden: "+err.message;}
    }
    function drawMapBase(){
      const svg=d3.select("#chart-map");svg.selectAll("*").remove();const W=1100,H=560;
      const proj=d3.geoNaturalEarth1().fitSize([W,H-30],{type:"FeatureCollection",features:mapData});
      const path=d3.geoPath(proj);
      svg.append("g").selectAll("path").data(mapData).join("path").attr("class","country nodata").attr("d",path)
        .on("mousemove",function(ev,d){const iso=NUM2ISO[+d.id],yr=+document.getElementById("yearSlider").value;const mt=emByYearIso.get(yr)&&emByYearIso.get(yr).get(iso);const v=(mt!=null)?modeVal(iso,mt):null;const unit=mapMode==="per"?" tCO\u2082e pro Kopf":" MtCO\u2082e";const fmt=mapMode==="per"?".1f":",.0f";tip.innerHTML="<b>"+(cleanCountryName(iso)||d.properties.name||iso||"Unbekannt")+"</b><br>"+(v!=null?d3.format(fmt)(v)+unit:"keine Daten");tip.style.left=(ev.clientX+14)+"px";tip.style.top=(ev.clientY-10)+"px";tip.style.opacity=1;}).on("mouseleave",()=>tip.style.opacity=0);
    }
    function updateMap(year){
      document.getElementById("yearLabel").textContent=year;document.getElementById("yearSlider").value=year;
      const yr=emByYearIso.get(year),sc=curScale();
      d3.select("#chart-map").selectAll(".country").attr("fill",d=>{const iso=NUM2ISO[+d.id];const mt=yr&&yr.get(iso);const v=(mt!=null&&mt>0)?modeVal(iso,mt):null;return (v!=null&&v>0)?sc(Math.min(v,sc.domain()[1])):null;}).classed("nodata",d=>{const iso=NUM2ISO[+d.id];const mt=yr&&yr.get(iso);const v=(mt!=null&&mt>0)?modeVal(iso,mt):null;return !(v!=null&&v>0);});
      updateRanking(year);
    }
    function updateRanking(year){
      const yr=emByYearIso.get(year);if(!yr)return;
      const rows=[];
      yr.forEach((mt,iso)=>{if(mt==null||mt<=0)return;const v=modeVal(iso,mt);if(v==null||!isFinite(v))return;rows.push([iso,v]);});
      rows.sort((a,b)=>b[1]-a[1]);
      const top=rows.slice(0,5);
      document.getElementById("rankTitle").textContent="Top 5 \u00B7 "+year;
      const unit=mapMode==="per"?" t":"",fmt=mapMode==="per"?".1f":",.0f";
      document.getElementById("rankList").innerHTML=top.map((r,i)=>{
        const name=cleanCountryName(r[0])||r[0];
        return '<div class="rank-row"><span class="pos">'+(i+1)+'</span><span class="nm">'+name+'</span><span class="vl">'+d3.format(fmt)(r[1])+unit+'</span></div>';
      }).join("");
    }
    function drawLegend(){
      const svg=d3.select("#chart-map");svg.selectAll(".legend").remove();svg.select("#legGrad").remove();
      const W=1100,lx=W-300,ly=525,lw=270,lh=10;
      const defs=svg.select("defs").empty()?svg.append("defs"):svg.select("defs");
      const g=defs.append("linearGradient").attr("id","legGrad");
      d3.range(0,1.01,0.1).forEach(t=>g.append("stop").attr("offset",(t*100)+"%").attr("stop-color",d3.interpolateYlOrRd(t)));
      const lg=svg.append("g").attr("class","legend");
      lg.append("rect").attr("x",lx).attr("y",ly).attr("width",lw).attr("height",lh).attr("fill","url(#legGrad)");
      lg.append("text").attr("x",lx).attr("y",ly-6).text("weniger");
      lg.append("text").attr("x",lx+lw).attr("y",ly-6).attr("text-anchor","end").text(mapMode==="per"?"mehr (tCO\u2082e pro Kopf)":"mehr Emissionen (MtCO\u2082e)");
    }
    function setMode(m){
      if(mapMode===m||!mapData)return;mapMode=m;
      document.getElementById("modeTotal").classList.toggle("active",m==="total");
      document.getElementById("modePer").classList.toggle("active",m==="per");
      drawLegend();updateMap(+document.getElementById("yearSlider").value);
    }
    document.getElementById("modeTotal").addEventListener("click",()=>setMode("total"));
    document.getElementById("modePer").addEventListener("click",()=>setMode("per"));
    const slider=document.getElementById("yearSlider"),playBtn=document.getElementById("playBtn");
    slider.addEventListener("input",()=>{if(mapData)updateMap(+slider.value);});
    playBtn.addEventListener("click",()=>{if(playTimer){clearInterval(playTimer);playTimer=null;playBtn.innerHTML="\u25B6";return;}playBtn.innerHTML="\u23F8";playTimer=setInterval(()=>{let y=+slider.value;y=y>=2023?1990:y+1;if(mapData)updateMap(y);},550);});

    /* AKT 3 : Szenario-Fächer */
    const SCEN=[["ssp2-45","Klimaschutz \u00B7 SSP2-4.5","#4987C1"],["ssp3-70","Mittlerer Pfad \u00B7 SSP3-7.0","#E89A3C"],["ssp5-85","Hohe Emissionen \u00B7 SSP5-8.5","#F5002E"]];
    const PER=[["historical_1986_2005",1995,"1986\u20132005"],["next_decades_2020_2039",2030,"2020\u20132039"],["midcentury_2040_2059",2050,"2040\u20132059"],["endcentury_2080_2099",2090,"2080\u20132099"]];
    let fanInit=false;
    function initFan(){
      if(fanInit)return;fanInit=true;
      const sel=document.getElementById("countrySelect");
      sel.innerHTML="";
      Object.keys(PROJ)
        .filter(iso=>cleanCountryName(iso))
        .sort((a,b)=>cleanCountryName(a).localeCompare(cleanCountryName(b),"de"))
        .forEach(iso=>{
          const o=document.createElement("option");
          o.value=iso;
          o.textContent=cleanCountryName(iso);
          sel.appendChild(o);
        });
      // Legende
      const leg=document.getElementById("fanLegend");
      SCEN.forEach(s=>{const d=document.createElement("div");d.className="item";d.innerHTML='<span class="sw" style="background:'+s[2]+'"></span>'+s[1];leg.appendChild(d);});
      sel.value=PROJ["DEU"]?"DEU":Object.keys(PROJ)[0];
      sel.addEventListener("change",()=>drawFan(sel.value));
      drawFan(sel.value);
    }
    function drawFan(iso){
      const svg=d3.select("#chart-fan");svg.selectAll("*").remove();
      const data=PROJ[iso];if(!data)return;
      const W=1100,H=500,m={t:20,r:120,b:50,l:55};
      let lo=Infinity,hi=-Infinity;
      SCEN.forEach(s=>{const sc=data[s[0]];if(!sc)return;PER.forEach(p=>{const v=sc[p[0]];if(v){lo=Math.min(lo,v[0]);hi=Math.max(hi,v[2]);}});});
      const pad=(hi-lo)*0.12||1;
      const x=d3.scaleLinear().domain([1990,2099]).range([m.l,W-m.r]);
      const y=d3.scaleLinear().domain([lo-pad,hi+pad]).range([H-m.b,m.t]);
      svg.append("g").attr("class","grid").attr("transform","translate("+m.l+",0)").call(d3.axisLeft(y).tickSize(-(W-m.l-m.r)).tickFormat("")).select(".domain").remove();
      svg.append("g").attr("class","axis").attr("transform","translate(0,"+(H-m.b)+")").call(d3.axisBottom(x).tickValues(PER.map(p=>p[1])).tickFormat((d,i)=>PER[i][2]));
      svg.append("g").attr("class","axis").attr("transform","translate("+m.l+",0)").call(d3.axisLeft(y).ticks(6).tickFormat(d=>num(d,0)+"\u00B0"));
      SCEN.forEach(s=>{
        const sc=data[s[0]];if(!sc)return;
        const pts=PER.filter(p=>sc[p[0]]).map(p=>({x:p[1],lo:sc[p[0]][0],mid:sc[p[0]][1],hi:sc[p[0]][2]}));
        const area=d3.area().x(d=>x(d.x)).y0(d=>y(d.lo)).y1(d=>y(d.hi)).curve(d3.curveMonotoneX);
        svg.append("path").datum(pts).attr("fill",s[2]).attr("opacity",.16).attr("d",area);
        const line=d3.line().x(d=>x(d.x)).y(d=>y(d.mid)).curve(d3.curveMonotoneX);
        const path=svg.append("path").datum(pts).attr("fill","none").attr("stroke",s[2]).attr("stroke-width",2.5).attr("d",line);
        const len=path.node().getTotalLength();
        path.attr("stroke-dasharray",len+" "+len).attr("stroke-dashoffset",len).transition().duration(1100).ease(d3.easeCubicOut).attr("stroke-dashoffset",0);
        const last=pts[pts.length-1];
        svg.append("text").attr("x",x(last.x)+8).attr("y",y(last.mid)+4).attr("fill",s[2]).attr("font-size",12).attr("font-weight",700).text(num(last.mid,1)+"\u00B0C");
      });
      // Satz
      const h=data["ssp2-45"]&&data["ssp2-45"]["historical_1986_2005"];
      const worst=data["ssp5-85"]&&data["ssp5-85"]["endcentury_2080_2099"];
      const best=data["ssp2-45"]&&data["ssp2-45"]["endcentury_2080_2099"];
      if(h&&worst){
        let s="In <b style='color:var(--ink)'>"+(cleanCountryName(iso)||iso)+"</b> lag die Jahresmitteltemperatur 1986\u20132005 bei rund "+num(h[1],1)+"\u00B0C. "+
          "Bei <b>hohen Emissionen</b> steigt sie bis 2080\u20132099 auf bis zu <b>"+num(worst[2],1)+"\u00B0C</b> \u2014 ein Plus von bis zu <b>"+num(worst[2]-h[1],1)+"\u00B0C</b>.";
        if(best){
          s+=" Mit konsequentem <b style='color:var(--blau)'>Klimaschutz</b> lie\u00DFe sich der Anstieg auf rund <b style='color:var(--blau)'>"+num(best[1]-h[1],1)+"\u00B0C</b> begrenzen. Diese Differenz von <b>"+num(worst[2]-best[1],1)+"\u00B0C</b> ist keine Statistik \u2014 sie entscheidet \u00FCber Hitze, Ernten und Lebensqualit\u00E4t einer ganzen Generation.";
        }
        document.getElementById("fanSentence").innerHTML=s;
      } else { document.getElementById("fanSentence").textContent=""; }
    }

    /* Scroll-Reveal + Nav + Lazy-Init */
    const io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");if(e.target.closest("#akt1"))drawTempChart();if(e.target.closest("#akt2"))initMap();if(e.target.closest("#akt3"))initFan();}});},{threshold:.2});
    document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
    const navLinks=document.querySelectorAll("nav a");
    const navIO=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)navLinks.forEach(a=>a.classList.toggle("active",a.dataset.t===e.target.id));});},{threshold:.5});
    document.querySelectorAll("section").forEach(s=>navIO.observe(s));
    yearInput.focus();
} catch (error) {
  showDataError(error);
}
}

const backToTop = document.getElementById("backToTop");

function toggleBackToTop() {
  if (!backToTop) return;

  if (window.scrollY > 300) {
    backToTop.classList.add("show");
  } else {
    backToTop.classList.remove("show");
  }
}

window.addEventListener("scroll", toggleBackToTop, { passive: true });
window.addEventListener("load", toggleBackToTop);
toggleBackToTop();

boot();
