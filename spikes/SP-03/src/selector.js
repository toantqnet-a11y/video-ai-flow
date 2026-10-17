/** Advisory media-path selection for the UI; authorization is STILL enforced by ImageService.
 * GPU presence alone does not prove a model fits VRAM or that ComfyUI has its weights.
 * A remote path is never selected on the basis of unavailable local GPU alone.
 */
export function recommendImagePath({ comfy, gpu, remoteConfigured = false, remoteConsent = false, paidApproval = false } = {}) {
  if (comfy?.reachable === true) {
    return { path: 'comfyui', readiness: 'SERVICE_REACHABLE_MODEL_UNTESTED', needs: ['api_workflow', 'compatible_weights', 'generation_smoke'], gpu: gpu?.detection ?? 'unknown' };
  }
  if (remoteConfigured && remoteConsent && paidApproval) {
    return { path: 'cloudflare', readiness: 'CONFIGURED_NOT_LIVE_TESTED', needs: ['credential', 'quota_or_cost_verification'] };
  }
  return { path: 'manual_import', readiness: 'AVAILABLE_WITH_LOCAL_IMAGE', needs: ['user_selected_image'], reason: 'Local image model unavailable or unverified; remote path not explicitly authorized' };
}
