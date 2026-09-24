/** Prevent Supabase's default row cap from silently omitting blocks/options. */
export async function selectAll(buildQuery,pageSize=500,maxRows=20000){
 const rows=[];
 for(let offset=0;offset<maxRows;offset+=pageSize){
  const {data,error}=await buildQuery().range(offset,offset+pageSize-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<pageSize)return rows;
 }
 throw new Error('Объём данных слишком большой для одной страницы. Обратитесь к администратору.');
}
