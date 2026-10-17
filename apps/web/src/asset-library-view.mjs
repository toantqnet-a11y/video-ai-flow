/** R2-09: display helpers only. No filesystem paths or queue side effects. */
export const assetHealthLabel={healthy:'Nguyên vẹn',missing:'Thiếu file',corrupt:'File hỏng',unsafe:'Không an toàn',unknown:'Không rõ'};
export const assetPlanLabel={reuse:'Tái sử dụng',regenerate:'Cần tạo lại',not_generated:'Chưa tạo',manual_preserved:'Giữ ảnh thủ công'};
export const bytesLabel=n=>!Number.isFinite(n)||n<0?'—':n>=1048576?`${(n/1048576).toFixed(1)} MiB`:`${Math.ceil(n/1024)} KiB`;
export function assetCanRestore(asset){return asset?.kind==='image'&&asset?.health==='healthy'&&asset?.state==='committed'&&!asset?.selected;}
