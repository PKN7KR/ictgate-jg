const https=require('https');
exports.handler=async(event,context)=>{
  context.callbackWaitsForEmptyEventLoop=false;
  const h={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:h,body:''};
  if(event.httpMethod!=='POST')return{statusCode:405,headers:h,body:JSON.stringify({error:'Method not allowed'})};
  let body;
  try{body=JSON.parse(event.body||'{}');}catch(e){return{statusCode:400,headers:h,body:JSON.stringify({error:'bad request'})};}
  const{public_ids}=body;
  if(!public_ids||!Array.isArray(public_ids)||!public_ids.length)return{statusCode:400,headers:h,body:JSON.stringify({error:'public_ids required'})};
  const CLOUD=process.env.CLD_CLOUD_NAME||'darovuaxi';
  const KEY=process.env.CLD_API_KEY;
  const SEC=process.env.CLD_API_SECRET;
  if(!KEY||!SEC)return{statusCode:500,headers:h,body:JSON.stringify({error:'env missing'})};
  const del=ids=>new Promise((res,rej)=>{
    const qs=ids.map(id=>`public_ids[]=${encodeURIComponent(id)}`).join('&')+'&invalidate=true';
    const req=https.request({hostname:'api.cloudinary.com',port:443,path:`/v1_1/${CLOUD}/resources/image/upload?${qs}`,method:'DELETE',auth:`${KEY}:${SEC}`,headers:{'Content-Type':'application/json'}},(r)=>{
      let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res({s:r.statusCode,d:JSON.parse(d)});}catch(e){res({s:r.statusCode,d:{}});}});
    });req.on('error',rej);req.end();
  });
  let deleted=0,failed=0,errors=[];
  for(let i=0;i<public_ids.length;i+=50){
    const batch=public_ids.slice(i,i+50);
    try{
      const r=await del(batch);
      if(r.s===200&&r.d.deleted){
        deleted+=Object.values(r.d.deleted).filter(v=>v==='deleted'||v==='not_found').length;
        failed+=batch.length-Object.values(r.d.deleted).filter(v=>v==='deleted'||v==='not_found').length;
      }else{failed+=batch.length;errors.push(r.s+':'+JSON.stringify(r.d).slice(0,100));}
    }catch(e){failed+=batch.length;errors.push(e.message);}
  }
  return{statusCode:200,headers:h,body:JSON.stringify({deleted,failed,errors,total:public_ids.length})};
};
