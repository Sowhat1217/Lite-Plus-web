export const LITE_AGENT_GITHUB_REPO = "nuomiiiii/Lite-agent";
export const LITE_AGENT_DOCKER_IMAGE = "ghcr.io/nuomiiiii/Lite-agent:latest";

export function defaultInstallGitHubProxy(
  settings?: { github_proxy?: unknown } | null,
): string {
  return typeof settings?.github_proxy === "string"
    ? settings.github_proxy.trim()
    : "";
}

export function liteAgentInstallScriptUrl(
  scriptFile: "install.sh" | "install.ps1",
  ghproxy = "",
) {
  let scriptUrl = `https://raw.githubusercontent.com/${LITE_AGENT_GITHUB_REPO}/main/${scriptFile}`;
  const proxy = ghproxy.trim();
  if (!proxy) return scriptUrl;
  scriptUrl = scriptUrl.slice("https://".length);
  scriptUrl = proxy.endsWith("/") ? `${proxy}${scriptUrl}` : `${proxy}/${scriptUrl}`;
  if (!scriptUrl.startsWith("http")) {
    scriptUrl = `http://${scriptUrl}`;
  }
  return scriptUrl;
}
