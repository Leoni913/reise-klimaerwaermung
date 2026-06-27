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
      projectionData,
      klimaEvents,
      impactsData
    ] = await Promise.all([
      loadJSON("gistemp_annual.json"),
      loadJSON("ghg_emissions.json"),
      loadJSON("world_topology.json"),
      loadJSON("num2iso.json"),
      loadJSON("country_names.json"),
      loadJSON("population_2023_million.json"),
      loadJSON("projections_temperature_compact.json"),
      loadJSON("klimaereignisse.json"),
      loadJSON("auswirkungen-pro-grad.json")
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
    const fmtTot=new Intl.NumberFormat("de-DE",{maximumFractionDigits:0});
    const fmtPer=new Intl.NumberFormat("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1});
    const emUnit=m=>m==="per"?"tCO\u2082e pro Kopf":"MtCO\u2082e";
    const emFmt=(v,m)=>m==="per"?fmtPer.format(v):fmtTot.format(v);
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
      /* Ereignis-Marker aus klimaereignisse.json */
      const KAT_FARBE={
        "Wissenschaft":"#4987C1",
        "Politik & Institutionen":"#5FC9A8",
        "Extremereignis":"#F5002E",
        "Rekord":"#E89A3C",
        "Wirtschaft & Politik":"#A78BFA",
        "Gesellschaft":"#F472B6"
      };
      const KAT_ALLE=Object.keys(KAT_FARBE);
      const eventsFiltered=klimaEvents.filter(e=>byYear.has(e.jahr));
      let activeKat=new Set(KAT_ALLE);
      const evtG=svg.append("g");

      /* Filter-Leiste oberhalb des Charts */
      const chartWrap=document.querySelector(".chart-wrap.card");
      if(chartWrap&&!document.getElementById("evt-filter-bar")){
        const bar=document.createElement("div");
        bar.id="evt-filter-bar";bar.className="evt-filter-bar";
        const lbl=document.createElement("span");
        lbl.className="evt-filter-lbl";lbl.textContent="Ereignisse:";
        bar.appendChild(lbl);
        KAT_ALLE.forEach(kat=>{
          const farbe=KAT_FARBE[kat];
          const btn=document.createElement("button");
          btn.className="evt-kat-btn active";btn.dataset.kat=kat;
          btn.style.setProperty("--kat-c",farbe);
          btn.innerHTML='<span class="evt-kat-dot"></span>'+kat;
          btn.addEventListener("click",()=>{
            if(activeKat.has(kat)){if(activeKat.size===1)return;activeKat.delete(kat);btn.classList.remove("active");}
            else{activeKat.add(kat);btn.classList.add("active");}
            renderEventMarkers();
          });
          bar.appendChild(btn);
        });
        chartWrap.insertBefore(bar,chartWrap.firstChild);
      }

      function renderEventMarkers(){
        evtG.selectAll("*").remove();
        const visible=eventsFiltered.filter(e=>activeKat.has(e.kategorie));
        const byPx=d3.group(visible,e=>Math.round(x(e.jahr)));
        byPx.forEach((group,px)=>{
          group.forEach((e,idx)=>{
            const py=y(byYear.get(e.jahr));
            const farbe=KAT_FARBE[e.kategorie]||"#fff";
            const yOff=idx*15;
            evtG.append("line")
              .attr("x1",px).attr("x2",px)
              .attr("y1",py-yOff).attr("y2",H-m.b)
              .attr("stroke",farbe).attr("stroke-opacity",.3)
              .attr("stroke-dasharray","3,3").attr("stroke-width",1);
            evtG.append("text")
              .attr("x",px).attr("y",py-16-yOff)
              .attr("text-anchor","middle")
              .attr("fill",farbe).attr("font-size",10).attr("font-weight",500)
              .text(e.jahr)
              .attr("opacity",0).transition().delay(2400).duration(500).attr("opacity",1);
            evtG.append("circle")
              .attr("cx",px).attr("cy",py-yOff).attr("r",0)
              .attr("fill",farbe).attr("stroke","var(--navy)").attr("stroke-width",1.5)
              .style("cursor","pointer")
              .on("mouseenter",function(ev2){
                d3.select(this).attr("r",7);
                tip.innerHTML="<b style='color:"+farbe+"'>"+e.jahr+" \u00B7 "+e.titel+"</b>"+
                  "<span class='tip-kat' style='background:"+farbe+"22;color:"+farbe+"'>"+e.kategorie+"</span>"+
                  "<br><span style='display:block;max-width:260px;margin-top:5px;color:#c2d2e2;font-weight:300;line-height:1.45'>"+e.beschreibung+"</span>";
                tip.style.opacity=1;
              })
              .on("mousemove",function(ev2){tip.style.left=(ev2.clientX+14)+"px";tip.style.top=(ev2.clientY-10)+"px";})
              .on("mouseleave",function(){d3.select(this).attr("r",5);tip.style.opacity=0;})
              .transition().delay(2400).duration(500).attr("r",5);
          });
        });
      }
      renderEventMarkers();
      drawStripeStrip();
    }
    /* Warming Stripes: ein Streifen je Jahr, ohne Achsen */
    function drawStripeStrip(){
      const svg=d3.select("#chart-stripes");if(!svg.selectAll("*").empty())return;
      const W=1100,H=70;const x=d3.scaleBand().domain(TEMP.map(d=>d[0])).range([0,W]).padding(0);
      svg.selectAll("rect.stripe").data(TEMP).join("rect").attr("class","stripe")
        .attr("x",d=>x(d[0])).attr("y",0).attr("width",x.bandwidth()+1).attr("height",H)
        .attr("fill",d=>stripeColor(d[1])).attr("opacity",0)
        .transition().duration(700).delay((d,i)=>i*(900/TEMP.length)).attr("opacity",1);
      /* Eckjahre dynamisch beschriften */
      const ys=document.getElementById("stripeYears");
      if(ys){ys.querySelector(".s-first").textContent=FIRST;ys.querySelector(".s-last").textContent=LAST;}
      /* Hover: helle Markierung des Jahres + Tooltip mit Jahr und Temperatur */
      const hl=svg.append("rect").attr("class","stripe-hl").attr("y",-1).attr("height",H+2)
        .attr("width",x.bandwidth()+1).attr("fill","none").style("stroke","var(--ink)")
        .attr("stroke-width",1.2).attr("opacity",0).style("pointer-events","none");
      svg.append("rect").attr("x",0).attr("y",0).attr("width",W).attr("height",H).attr("fill","transparent")
        .on("mousemove",function(ev){
          const px=d3.pointer(ev,svg.node())[0];
          let i=Math.floor(px/W*TEMP.length);if(i<0)i=0;if(i>=TEMP.length)i=TEMP.length-1;
          const d=TEMP[i];
          hl.attr("x",x(d[0])).attr("opacity",1);
          tip.innerHTML="<b>"+d[0]+"</b> &nbsp; "+de(d[1])+" \u00B0C";
          tip.style.left=(ev.clientX+14)+"px";tip.style.top=(ev.clientY-10)+"px";tip.style.opacity=1;
        })
        .on("mouseleave",function(){hl.attr("opacity",0);tip.style.opacity=0;});
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
        const EM_SCHEME=["#ffe9a8","#fdc651","#fb9a3c","#f4622a","#dd2f1c","#b10026","#6d0019"];
        colTotal=d3.scaleQuantile().domain(totVals).range(EM_SCHEME);
        colPer=d3.scaleQuantile().domain(perVals).range(EM_SCHEME);
        drawMapBase();drawLegend();updateMap(+document.getElementById("yearSlider").value);
      }catch(err){document.getElementById("mapStatus").textContent="Karte konnte nicht initialisiert werden: "+err.message;}
    }
    function drawMapBase(){
      const svg=d3.select("#chart-map");svg.selectAll("*").remove();const W=1100,H=560;
      const proj=d3.geoNaturalEarth1().fitSize([W,H-30],{type:"FeatureCollection",features:mapData});
      const path=d3.geoPath(proj);
      svg.append("g").selectAll("path").data(mapData).join("path").attr("class","country nodata").attr("d",path)
        .on("mousemove",function(ev,d){const iso=NUM2ISO[+d.id],yr=+document.getElementById("yearSlider").value;const mt=emByYearIso.get(yr)&&emByYearIso.get(yr).get(iso);const v=(mt!=null)?modeVal(iso,mt):null;tip.innerHTML="<b>"+(cleanCountryName(iso)||d.properties.name||iso||"Unbekannt")+"</b><br>"+(v!=null?emFmt(v,mapMode)+" "+emUnit(mapMode):"keine Daten");tip.style.left=(ev.clientX+14)+"px";tip.style.top=(ev.clientY-10)+"px";tip.style.opacity=1;}).on("mouseleave",()=>tip.style.opacity=0);
    }
    function updateMap(year){
      document.getElementById("yearLabel").textContent=year;document.getElementById("yearSlider").value=year;
      const yr=emByYearIso.get(year),sc=curScale();
      d3.select("#chart-map").selectAll(".country").attr("fill",d=>{const iso=NUM2ISO[+d.id];const mt=yr&&yr.get(iso);const v=(mt!=null&&mt>0)?modeVal(iso,mt):null;return (v!=null&&v>0)?sc(v):null;}).classed("nodata",d=>{const iso=NUM2ISO[+d.id];const mt=yr&&yr.get(iso);const v=(mt!=null&&mt>0)?modeVal(iso,mt):null;return !(v!=null&&v>0);});
      updateRanking(year);
    }
    function updateRanking(year){
      const yr=emByYearIso.get(year);if(!yr)return;
      const rows=[];
      yr.forEach((mt,iso)=>{if(mt==null||mt<=0)return;const v=modeVal(iso,mt);if(v==null||!isFinite(v))return;rows.push([iso,v]);});
      rows.sort((a,b)=>b[1]-a[1]);
      const top=rows.slice(0,5);
      document.getElementById("rankTitle").innerHTML="Top 5 \u00B7 "+year+' <span class="unit">\u00B7 '+emUnit(mapMode)+"</span>";
      document.getElementById("rankList").innerHTML=top.map((r,i)=>{
        const name=cleanCountryName(r[0])||r[0];
        return '<div class="rank-row"><span class="pos">'+(i+1)+'</span><span class="nm">'+name+'</span><span class="vl">'+emFmt(r[1],mapMode)+'</span></div>';
      }).join("");
    }
    function drawLegend(){
      const svg=d3.select("#chart-map");svg.selectAll(".legend").remove();svg.select("#legGrad").remove();
      const sc=curScale();if(!sc||!sc.quantiles)return;
      const qs=sc.quantiles(),cols=sc.range();
      const W=1100,n=cols.length,swW=34,swH=11,lw=n*swW,lx=W-lw-30,ly=525;
      const lg=svg.append("g").attr("class","legend");
      lg.append("text").attr("x",lx).attr("y",ly-9).text(mapMode==="per"?"Pro Kopf (tCO\u2082e)":"Emissionen (MtCO\u2082e)");
      const shortNum=x=>{
        if(mapMode==="per")return fmtPer.format(x);
        return x>=1000?(Math.round(x/100)/10).toString().replace(".",",")+"k":fmtTot.format(Math.round(x));
      };
      cols.forEach((c,i)=>{
        lg.append("rect").attr("x",lx+i*swW).attr("y",ly).attr("width",swW).attr("height",swH).attr("fill",c);
        if(i>0)lg.append("text").attr("x",lx+i*swW).attr("y",ly+swH+12).attr("text-anchor","middle").text(shortNum(qs[i-1]));
      });
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

    /* AKT IV : Grad-Explorer (Auswirkungen pro Grad) */
    const GE_COL=["#4987C1","#E8B84A","#E8772E","#F5002E"];
    const GE_GLOW=[0.10,0.16,0.26,0.40];
    const GE_ICONS={
      "\uD83C\uDF21":'<rect x="20" y="6" width="8" height="24" rx="4"/><circle cx="24" cy="36" r="7"/><line x1="24" y1="15" x2="24" y2="33"/>',
      "\uD83C\uDFDC":'<circle cx="24" cy="15" r="7"/><line x1="24" y1="3" x2="24" y2="5"/><line x1="9" y1="15" x2="11" y2="15"/><line x1="37" y1="15" x2="39" y2="15"/><line x1="13" y1="5" x2="15" y2="7"/><line x1="35" y1="5" x2="33" y2="7"/><path d="M6 34h12l3 6 4-11 3 5h13"/>',
      "\uD83C\uDF0A":'<path d="M6 22c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0"/><path d="M6 31c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0"/><path d="M6 40c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0"/>',
      "\uD83D\uDC3E":'<ellipse cx="15" cy="19" rx="3" ry="4"/><ellipse cx="24" cy="14" rx="3" ry="4.5"/><ellipse cx="33" cy="19" rx="3" ry="4"/><path d="M24 41c-6 0-11-3-11-8 0-4 5-6 11-6s11 2 11 6c0 5-5 8-11 8z"/>',
      "\uD83E\uDEB8":'<path d="M24 42V22"/><path d="M24 31c0-6-4-9-9-9"/><path d="M15 22c0-5 2-7 0-12"/><path d="M24 27c0-6 4-9 9-9"/><path d="M33 18c0-5-2-7 0-12"/><path d="M14 42h20"/>',
      "\uD83E\uDDCA":'<path d="M24 7l15 8.5v17L24 41 9 32.5v-17z"/><path d="M9 15.5l15 8.5 15-8.5"/><path d="M24 24v17"/>',
      "\u26F0":'<path d="M5 40l11-20 8 14 5-8 9 14z"/><path d="M12 27l4-7 4 7"/>',
      "\uD83C\uDF0D":'<circle cx="24" cy="24" r="17"/><path d="M7 24h34"/><path d="M24 7c5 5 5 29 0 34"/><path d="M24 7c-5 5-5 29 0 34"/>',
      "\uD83C\uDF3E":'<path d="M24 42V18"/><path d="M24 23c-4-1-7-4-7-9 4 1 7 4 7 9z"/><path d="M24 23c4-1 7-4 7-9-4 1-7 4-7 9z"/><path d="M24 31c-4-1-7-4-7-9 4 1 7 4 7 9z"/><path d="M24 31c4-1 7-4 7-9-4 1-7 4-7 9z"/>',
      "\u26A0":'<path d="M24 8l18 32H6z"/><line x1="24" y1="20" x2="24" y2="30"/><circle cx="24" cy="35" r="1.4" fill="currentColor" stroke="none"/>',
      "\uD83C\uDFE5":'<rect x="8" y="8" width="32" height="32" rx="8"/><line x1="24" y1="16" x2="24" y2="32"/><line x1="16" y1="24" x2="32" y2="24"/>',
      "\uD83D\uDEB6":'<circle cx="25" cy="9" r="4"/><path d="M25 14v12"/><path d="M25 18l-7 5"/><path d="M25 20l7 4"/><path d="M25 26l-5 14"/><path d="M25 26l5 14"/>'
    };
    const geHexA=(hex,a)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return "rgba("+r+","+g+","+b+","+a+")";};
    const geIcon=emoji=>{const key=(emoji||"").replace(/\uFE0F/g,"");const inner=GE_ICONS[key]||GE_ICONS["\u26A0"];return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';};
    function buildImpacts(data){
      if(!data||!data.length)return;
      const root=document.getElementById("gradExplorer"),big=document.getElementById("geBig"),desc=document.getElementById("geDesc"),grid=document.getElementById("geGrid"),glow=document.getElementById("geGlow"),stopsEl=document.getElementById("geStops");
      if(!stopsEl)return;
      stopsEl.innerHTML="";
      data.forEach((d,i)=>{
        const b=document.createElement("button");
        b.type="button";b.className="ge-stop";b.setAttribute("aria-label",d.label);
        b.innerHTML='<span class="dot"></span><span class="lab">'+d.label.replace(/ /g,"\u00A0")+'</span>';
        b.addEventListener("click",()=>geSelect(i));
        stopsEl.appendChild(b);
      });
      function geSelect(i){
        const d=data[i],c=GE_COL[i]||GE_COL[GE_COL.length-1];
        big.innerHTML=d.label.replace(/ /g,"\u00A0");big.style.color=c;
        glow.style.background="radial-gradient(circle,"+c+" 0%,transparent 70%)";glow.style.opacity=GE_GLOW[i]!=null?GE_GLOW[i]:0.3;
        root.style.boxShadow="inset 0 1px 0 "+geHexA(c,.25);
        desc.style.opacity=0;
        Array.prototype.forEach.call(stopsEl.children,(bb,j)=>{
          const dot=bb.querySelector(".dot"),lab=bb.querySelector(".lab"),on=j===i,cc=GE_COL[j]||c;
          dot.style.background=on?cc:"#22384e";dot.style.borderColor=on?cc:"#34506c";
          dot.style.transform=on?"scale(1.5)":"scale(1)";dot.style.boxShadow=on?"0 0 0 5px "+geHexA(cc,.18):"none";
          lab.style.color=on?"var(--ink)":"var(--muted)";
        });
        grid.innerHTML="";
        (d.kategorien||[]).forEach((k,idx)=>{
          const card=document.createElement("div");card.className="ge-card";
          card.style.borderLeft="3px solid "+c;card.style.transitionDelay=(idx*45)+"ms";
          card.innerHTML='<div class="ic" style="color:'+c+';background:'+geHexA(c,.14)+'">'+geIcon(k.icon)+'</div>'+
            '<div class="ct"><div class="th">'+k.thema+'</div><div class="tx">'+k.auswirkung+'</div></div>';
          grid.appendChild(card);
        });
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          desc.textContent=d.beschreibung;desc.style.opacity=1;
          Array.prototype.forEach.call(grid.children,card=>{card.style.opacity=1;card.style.transform="translateY(0)";});
        }));
      }
      geSelect(0);
    }
    buildImpacts(impactsData);

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
