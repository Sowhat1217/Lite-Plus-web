import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import StarOutline from "@mui/icons-material/StarBorder";
import Star from "@mui/icons-material/Star";
import { toast } from "sonner";
import SettingsSheetDialog from "@/components/admin/SettingsSheetDialog";
import { Copy, Download, Eye, LinkIcon, Pencil, Plus, Trash, Upload } from "@/components/admin/muiIcons";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { TEMPLATE_CLIENTS } from "./subscriptionClients";

type Template = { id: string; name: string; kind: string; content: string; revision?: number };
type Binding = { scope: string; scope_id: string; client: string; template_id: string };
type Row = { id: string; name?: string; username?: string; user_id?: string };
type TemplateList = { templates: Template[]; builtins: Template[]; bindings: Binding[] };
type Preview = { body: string; warnings: string[] };
const kinds = ["clash", "surge", "loon", "sing-box"];
const kindOf = (client: string) => ["mihomo", "clash", "stash"].includes(client) ? "clash" : client === "surge-mac" ? "surge" : client;
const kindLabel = (kind: string) => ({ clash: "Clash", loon: "Loon", surge: "Surge", "sing-box": "sing-box" })[kind] || kind;
const extension = (kind: string) => ({ clash: "yaml", loon: "lcf", surge: "conf", "sing-box": "json" })[kind] || "txt";
const rowLabel = (row: Row) => row.name || row.username || row.user_id || row.id;
const clientLabel = (client: string) => ({ mihomo: "Mihomo / Clash Meta", clash: "Clash", stash: "Stash", loon: "Loon", surge: "Surge iOS", "surge-mac": "Surge macOS", "sing-box": "sing-box" })[client] || client;
const draftKey = (value: Template) => JSON.stringify([value.name, value.kind, value.content]);
const fieldSx = { minWidth: 160, flex: 1 };
const codeSx = { m: 0, p: 2, minHeight: 240, maxHeight: "40vh", overflow: "auto", bgcolor: "action.hover", borderRadius: 1, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" };

function filename(template: Template) {
  return /\.(yaml|yml|lcf|conf|json)$/i.test(template.name) ? template.name : `${template.name || "template"}.${extension(template.kind)}`;
}

function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SubscriptionTemplates({ subs, plans }: { subs: Row[]; plans: Row[] }) {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const [data, setData] = useState<TemplateList>({ templates: [], builtins: [], bindings: [] });
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState<Template>({ id: "", name: "", kind: "clash", content: "" });
  const [dialog, setDialog] = useState<"create" | "edit" | "preview" | "bindings" | null>(null);
  const [createKind, setCreateKind] = useState("clash");
  const [draftBaseline, setDraftBaseline] = useState("");
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [defaultTarget, setDefaultTarget] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("plan");
  const [scopeID, setScopeID] = useState("");
  const [assignmentTemplate, setAssignmentTemplate] = useState<Template | null>(null);
  const [assignmentClients, setAssignmentClients] = useState<string[]>([]);
  const [subscriptionID, setSubscriptionID] = useState("");
  const [previewClient, setPreviewClient] = useState("mihomo");
  const [preview, setPreview] = useState<Preview | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await call("admin:nodemgt.template.list", {}) as TemplateList;
      setData(next);
      return next;
    } finally { setLoading(false); }
  }, [call]);
  useEffect(() => { void reload().catch((err: unknown) => setError(String(err))); }, [reload]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  const fetchPreview = async (template: Template, subID: string, target: string) => {
    setPreview(null);
    const result = await call("admin:nodemgt.template.preview", { subscription_id: subID, target, template }) as Preview;
    setPreview(result);
  };
  const openTemplate = (value: Template, mode: "edit" | "preview", copy = false) => {
    const next = { ...value, id: copy ? "" : value.id };
    const target = value.kind === "clash" ? "mihomo" : value.kind;
    const subID = subs.some((row) => row.id === subscriptionID) ? subscriptionID : subs[0]?.id || "";
    setDraft(next);
    setDraftBaseline(draftKey(next));
    setPreviewClient(target);
    setSubscriptionID(subID);
    setPreview(null);
    setError("");
    setDialog(mode);
    if (mode === "preview" && subID) void run(() => fetchPreview(next, subID, target));
  };
  const updateDraft = (next: Template) => { setDraft(next); setPreview(null); };
  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 1024 * 1024) { setError(t("nodemgt.tpl_file_limit")); return; }
    void run(async () => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const kind = ext === "lcf" ? "loon" : ext === "conf" ? "surge" : ext === "json" ? "sing-box" : "clash";
      openTemplate({ id: "", name: file.name, kind, content: await file.text() }, "edit");
    });
  };
  const isDefault = (template: Template) => TEMPLATE_CLIENTS.filter((value) => kindOf(value) === template.kind)
    .every((value) => data.bindings.some((b) => b.scope === "global" && !b.scope_id && b.client === value && b.template_id === template.id));
  const setDefault = (template: Template) => void run(async () => {
    const templateID = isDefault(template) ? "" : template.id;
    // Refresh even after a partial failure so the displayed bindings reflect the server.
    try {
      for (const target of TEMPLATE_CLIENTS.filter((value) => kindOf(value) === template.kind)) {
        await call("admin:nodemgt.template.bind", { scope: "global", scope_id: "", client: target, template_id: templateID });
      }
    } finally { await reload(); }
    toast.success(t("nodemgt.saved"));
    setDefaultTarget(null);
  });
  const currentBinding = (client: string) => data.bindings.find((b) => b.scope === scope && b.scope_id === scopeID && b.client === client)?.template_id || "";
  const scopes = scope === "plan" ? plans : subs;
  const bindingReady = Boolean(scopeID) && assignmentClients.length > 0;
  const rows = data.templates.filter((row) => filter === "all" || row.kind === filter);
  const confirmDiscard = (action: () => void) => {
    if (dialog === "edit" && draftKey(draft) !== draftBaseline) {
      setDiscardAction(() => action);
    } else action();
  };
  const closeDialog = () => { if (!busy) confirmDiscard(() => { setDialog(null); setError(""); setPreview(null); }); };
  const openBindings = (template: Template, nextScope = "plan", nextID = "", clients?: string[]) => {
    setAssignmentTemplate(template); setScope(nextScope); setScopeID(nextID);
    setAssignmentClients(clients || TEMPLATE_CLIENTS.filter((client) => kindOf(client) === template.kind));
    setError(""); setDialog("bindings");
  };
  const inheritedTemplate = (client: string) => {
    if (scope === "subscription") return t("nodemgt.tpl_follow_plan");
    const global = data.bindings.find((b) => b.scope === "global" && !b.scope_id && b.client === client);
    const name = data.templates.find((row) => row.id === global?.template_id)?.name || t("nodemgt.tpl_base_config");
    return t("nodemgt.tpl_follow_global", { name });
  };
  const applyAssignment = (templateID: string) => void run(async () => {
    try {
      for (const client of assignmentClients) {
        await call("admin:nodemgt.template.bind", { scope, scope_id: scopeID, client, template_id: templateID });
      }
    } finally { await reload(); }
    setDialog(null); toast.success(t("nodemgt.saved"));
  });
  const uploadButton = (
    <Button component="label" disabled={busy || loading} startIcon={<Upload size={16} />} sx={{ whiteSpace: "nowrap" }}>
      {t("nodemgt.tpl_upload")}<input hidden type="file" accept=".yaml,.yml,.lcf,.conf,.json" onChange={importFile} />
    </Button>
  );
  const previewControls = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
      <TextField select size="small" label={t("nodemgt.tpl_preview_user")} value={subscriptionID} sx={fieldSx} disabled={busy} onChange={(e) => { setSubscriptionID(e.target.value); setPreview(null); }}>
        <MenuItem value="">{t("nodemgt.tpl_choose")}</MenuItem>
        {subs.map((row) => <MenuItem key={row.id} value={row.id}>{rowLabel(row)}</MenuItem>)}
      </TextField>
      <TextField select size="small" label={t("nodemgt.tpl_client")} value={previewClient} sx={fieldSx} disabled={busy} onChange={(e) => { setPreviewClient(e.target.value); setPreview(null); }}>
        {TEMPLATE_CLIENTS.filter((value) => kindOf(value) === draft.kind).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
      </TextField>
    </Stack>
  );
  const previewResult = (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2">{t("nodemgt.tpl_preview_result")}</Typography>
      {previewControls}
      <Button variant="outlined" startIcon={<Eye size={16} />} disabled={busy || !subscriptionID || !draft.content} onClick={() => void run(() => fetchPreview(draft, subscriptionID, previewClient))}>{t(preview ? "nodemgt.tpl_refresh_preview" : "nodemgt.tpl_generate_preview")}</Button>
      {preview?.warnings?.map((warning, i) => <Alert key={i} severity="warning">{warning}</Alert>)}
      {preview ? <Box component="pre" sx={codeSx}>{preview.body}</Box> : <Box sx={{ ...codeSx, display: "grid", placeItems: "center", color: "text.secondary", textAlign: "center", fontFamily: "inherit" }}>
        {busy ? t("nodemgt.tpl_generating") : t(subs.length ? "nodemgt.tpl_preview_hint" : "nodemgt.tpl_no_subscriptions")}
      </Box>}
    </Stack>
  );

  return (
    <>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" variant="h6" sx={{ fontWeight: 700 }}>{t("nodemgt.tab_templates")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{t("nodemgt.tpl_list_help")}</Typography>
            </Box>
            <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Tabs value={filter} onChange={(_, value: string) => setFilter(value)} variant="scrollable" scrollButtons="auto" aria-label={t("nodemgt.tpl_kind")}
                sx={{ minHeight: 42, maxWidth: "100%", bgcolor: "action.hover", borderRadius: 1,
                  "& [role='tablist']": { p: "5px", gap: "4px", alignItems: "center" },
                  "& .MuiTabs-indicator": { display: "none" },
                  "& .MuiTab-root": { height: 32, minHeight: 32, minWidth: 56, px: 1.5, py: 0.5, borderRadius: "6px", textTransform: "none", fontSize: 13 },
                  "& .Mui-selected": { bgcolor: "background.paper", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.16)", color: "text.primary" } }}>
                <Tab value="all" label={t("nodemgt.tpl_all")} />
                {kinds.map((kind) => <Tab key={kind} value={kind} label={kindLabel(kind)} />)}
              </Tabs>
              <Button variant="contained" startIcon={<Plus size={17} />} disabled={busy || loading || !data.builtins.length} onClick={() => {
                setCreateKind(filter === "all" ? "clash" : filter); setError(""); setDialog("create");
              }} sx={{ whiteSpace: "nowrap" }}>{t("nodemgt.tpl_new")}</Button>
            </Stack>
          </Stack>
          {error && !dialog && !deleteTarget && !defaultTarget ? <Alert severity="error" action={<Button color="inherit" size="small" disabled={busy || loading} onClick={() => void run(async () => { await reload(); })}>{t("nodemgt.tpl_retry")}</Button>}>{error}</Alert> : null}
          <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Table aria-label={t("nodemgt.tab_templates")} sx={{ minWidth: 520 }}>
              <TableHead><TableRow>
                <TableCell sx={{ color: "text.secondary" }}>{t("nodemgt.tpl_name")}</TableCell>
                <TableCell sx={{ width: "38%", color: "text.secondary" }}>{t("nodemgt.col_actions")}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {loading ? [0, 1, 2].map((value) => <TableRow key={value}><TableCell colSpan={2}><Skeleton height={42} /></TableCell></TableRow>) : rows.map((row) => {
                  const bound = data.bindings.some((b) => b.template_id === row.id);
                  const defaults = data.bindings.filter((b) => b.scope === "global" && !b.scope_id && b.template_id === row.id).map((b) => b.client);
                  const active = isDefault(row);
                  const locations = data.bindings.filter((b) => b.scope !== "global" && b.template_id === row.id)
                    .filter((b, i, all) => all.findIndex((item) => item.scope === b.scope && item.scope_id === b.scope_id) === i);
                  return <TableRow key={row.id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                    <TableCell sx={{ py: 2.25 }}>
                      <Stack direction="row" useFlexGap sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: "anywhere" }}>{row.name}</Typography>
                        <Chip size="small" variant="outlined" label={kindLabel(row.kind)} sx={{ height: 24, fontSize: 12 }} />
                        {defaults.length ? <Tooltip describeChild title={defaults.map(clientLabel).join(", ")}><Chip size="small" color="primary" variant="outlined" label={t(active ? "nodemgt.tpl_is_default" : "nodemgt.tpl_partial_default")} sx={{ height: 24, fontSize: 12 }} /></Tooltip> : null}
                      </Stack>
                      {locations.length ? <Stack direction="row" useFlexGap sx={{ mt: 1, gap: 0.75, flexWrap: "wrap" }}>
                        {locations.map((binding) => {
                          const source = (binding.scope === "plan" ? plans : subs).find((item) => item.id === binding.scope_id);
                          const clients = data.bindings.filter((b) => b.scope === binding.scope && b.scope_id === binding.scope_id && b.template_id === row.id).map((b) => b.client);
                          return <Tooltip describeChild key={`${binding.scope}/${binding.scope_id}`} title={clients.map(clientLabel).join(", ")}><Chip size="small" variant="outlined" label={`${t(binding.scope === "plan" ? "nodemgt.tpl_to_plan" : "nodemgt.tpl_to_user")} · ${source ? rowLabel(source) : binding.scope_id}`} onClick={() => openBindings(row, binding.scope, binding.scope_id, clients)} /></Tooltip>;
                        })}
                      </Stack> : null}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title={t(active ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")}><span><IconButton size="small" aria-label={t(active ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")} disabled={busy} onClick={() => { setError(""); setDefaultTarget(row); }} color={active ? "primary" : "default"}>{active ? <Star fontSize="small" /> : <StarOutline fontSize="small" />}</IconButton></span></Tooltip>
                        <Tooltip title={t("nodemgt.edit")}><span><IconButton size="small" aria-label={t("nodemgt.edit")} disabled={busy} onClick={() => openTemplate(row, "edit")}><Pencil size={17} /></IconButton></span></Tooltip>
                        <Tooltip title={t("nodemgt.tpl_preview")}><span><IconButton size="small" aria-label={t("nodemgt.tpl_preview")} disabled={busy} onClick={() => openTemplate(row, "preview")}><Eye size={17} /></IconButton></span></Tooltip>
                        <Tooltip title={t("nodemgt.tpl_apply_to")}><span><IconButton size="small" aria-label={t("nodemgt.tpl_apply_to")} disabled={busy} onClick={() => openBindings(row)}><LinkIcon size={17} /></IconButton></span></Tooltip>
                        <Tooltip title={t(bound ? "nodemgt.tpl_bound_delete" : "nodemgt.delete")}><span><IconButton size="small" color="error" aria-label={t("nodemgt.delete")} disabled={busy || bound} onClick={() => { setError(""); setDeleteTarget(row); }}><Trash size={17} /></IconButton></span></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>;
                })}
                {!loading && !rows.length ? <TableRow><TableCell colSpan={2} sx={{ py: 8, textAlign: "center", color: "text.secondary" }}>{t("nodemgt.tpl_empty")}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </TableContainer>
          <Box>{uploadButton}</Box>
        </Stack>
      </Paper>

      <SettingsSheetDialog open={dialog === "create"} onClose={closeDialog} disableClose={busy} maxWidth={620} title={t("nodemgt.tpl_new")} actions={<Button disabled={busy} onClick={closeDialog}>{t("cancel")}</Button>}>
        <Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_create_help")}</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Tabs value={createKind} onChange={(_, value: string) => setCreateKind(value)} variant="scrollable" aria-label={t("nodemgt.tpl_kind")}>
          {kinds.map((kind) => <Tab key={kind} value={kind} label={kindLabel(kind)} />)}
        </Tabs>
        <Stack spacing={1.5} sx={{ pb: 2 }}>
          <Button variant="outlined" disabled={busy} startIcon={<Plus size={20} />} sx={{ justifyContent: "flex-start", p: 2, textAlign: "left" }} onClick={() => {
            const starter = data.builtins.find((row) => row.kind === createKind);
            if (starter) openTemplate({ ...starter, name: "" }, "edit", true);
          }}><Box><Typography sx={{ fontWeight: 600 }}>{t("nodemgt.tpl_start_base")}</Typography><Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_start_base_help")}</Typography></Box></Button>
          <Button component="label" variant="outlined" disabled={busy} startIcon={<Upload size={20} />} sx={{ justifyContent: "flex-start", p: 2, textAlign: "left" }}>
            <Box><Typography sx={{ fontWeight: 600 }}>{t("nodemgt.tpl_upload")}</Typography><Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_import_help")}</Typography></Box>
            <input hidden type="file" accept=".yaml,.yml,.lcf,.conf,.json" onChange={importFile} />
          </Button>
          <Button variant="outlined" disabled={busy} startIcon={<Copy size={20} />} sx={{ justifyContent: "flex-start", p: 2, textAlign: "left" }} onClick={() => openTemplate({ id: "", kind: createKind, name: "", content: "" }, "edit")}>
            <Box><Typography sx={{ fontWeight: 600 }}>{t("nodemgt.tpl_paste")}</Typography><Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_paste_help")}</Typography></Box>
          </Button>
        </Stack>
      </SettingsSheetDialog>

      <SettingsSheetDialog open={dialog === "edit" || dialog === "preview"} onClose={closeDialog} disableClose={busy} maxWidth={1240}
        title={dialog === "preview" ? t("nodemgt.tpl_preview") + " · " + draft.name : draft.id ? t("nodemgt.edit") + " · " + draft.name : t("nodemgt.tpl_new")}
        headerAction={dialog === "edit" ? <Stack direction="row" spacing={1}>
          <Tooltip title={t("nodemgt.tpl_download")}><span><IconButton size="small" aria-label={t("nodemgt.tpl_download")} disabled={!draft.content || busy} onClick={() => download(draft.content, filename(draft))}><Download size={18} /></IconButton></span></Tooltip>
          <Tooltip title={t("nodemgt.tpl_copy")}><span><IconButton size="small" aria-label={t("nodemgt.tpl_copy")} disabled={!draft.id || busy} onClick={() => updateDraft({ ...draft, id: "", name: t("nodemgt.tpl_copy_name", { name: draft.name }) })}><Copy size={18} /></IconButton></span></Tooltip>
        </Stack> : undefined}
        actions={<>
          <Button onClick={closeDialog} disabled={busy}>{t(dialog === "edit" ? "cancel" : "common.close")}</Button>
          {dialog === "preview" ? <Button variant="contained" startIcon={<Download size={16} />} disabled={!preview || busy} onClick={() => preview && download(preview.body, "preview." + extension(draft.kind))}>{t("nodemgt.tpl_download_config")}</Button> : <Button variant="contained" disabled={busy || !draft.name.trim() || !draft.content.trim()} onClick={() => void run(async () => {
            await call("admin:nodemgt.template.upsert", { ...draft, id: draft.id || undefined });
            await reload(); if (filter !== "all") setFilter(draft.kind); setDialog(null); setPreview(null); toast.success(t("nodemgt.saved"));
          })}>{t("nodemgt.tpl_save_template")}</Button>}
        </>}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {dialog === "edit" ? <Stack direction="row" spacing={1.5} sx={{ pt: 1, alignItems: "center" }}>
          <TextField size="small" label={t("nodemgt.tpl_name")} placeholder={t("nodemgt.tpl_name_hint")} value={draft.name} disabled={busy} fullWidth onChange={(e) => updateDraft({ ...draft, name: e.target.value })} />
          <Chip variant="outlined" label={kindLabel(draft.kind)} />
        </Stack> : <Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_compare_help")}</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 2.5, pb: 1 }}>
          <Stack spacing={1.5} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">{t("nodemgt.tpl_content")}</Typography>
            {dialog === "edit" ? <TextField multiline minRows={15} maxRows={19} fullWidth value={draft.content} disabled={busy} onChange={(e) => updateDraft({ ...draft, content: e.target.value })}
              slotProps={{ htmlInput: { "aria-label": t("nodemgt.tpl_content"), spellCheck: false, style: { fontFamily: "monospace", fontSize: 12, lineHeight: 1.7 } } }} /> : <Box component="pre" sx={codeSx}>{draft.content}</Box>}
            {draft.kind === "sing-box" ? <Typography variant="caption" color="text.secondary">{t("nodemgt.tpl_marker_help")}</Typography> : null}
          </Stack>
          {previewResult}
        </Box>
      </SettingsSheetDialog>

      <SettingsSheetDialog open={dialog === "bindings"} onClose={closeDialog} disableClose={busy} maxWidth={720}
        title={t("nodemgt.tpl_apply_title", { name: assignmentTemplate?.name })}
        actions={<>
          <Button disabled={busy} onClick={closeDialog}>{t("cancel")}</Button>
          <Button disabled={busy || !bindingReady || !assignmentClients.some((client) => Boolean(currentBinding(client)))} onClick={() => applyAssignment("")}>{t("nodemgt.tpl_restore_default")}</Button>
          <Button variant="contained" disabled={busy || !bindingReady || assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id)} onClick={() => assignmentTemplate && applyAssignment(assignmentTemplate.id)}>{t("nodemgt.tpl_apply_template")}</Button>
        </>}>
        <Typography variant="body2" color="text.secondary">{t("nodemgt.tpl_apply_help")}</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Tabs value={scope} onChange={(_, value: string) => { setScope(value); setScopeID(""); setError(""); }} aria-label={t("nodemgt.tpl_apply_to")}>
          <Tab value="plan" label={t("nodemgt.tpl_to_plan")} /><Tab value="subscription" label={t("nodemgt.tpl_to_user")} />
        </Tabs>
        <TextField select size="small" label={t(scope === "plan" ? "nodemgt.tpl_choose_plan" : "nodemgt.tpl_choose_user")} value={scopeID} disabled={busy} onChange={(e) => { setScopeID(e.target.value); setError(""); }} sx={{ mt: 1 }}>
          <MenuItem value="">{t("nodemgt.tpl_choose")}</MenuItem>
          {scopes.map((row) => <MenuItem key={row.id} value={row.id}>{rowLabel(row)}</MenuItem>)}
        </TextField>
        {!scopes.length ? <Alert severity="info">{t(scope === "plan" ? "nodemgt.tpl_no_plans" : "nodemgt.tpl_no_users")}</Alert> : null}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t("nodemgt.tpl_affected_clients")}</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }}>
            {TEMPLATE_CLIENTS.filter((client) => kindOf(client) === assignmentTemplate?.kind).map((client) => <FormControlLabel key={client} label={clientLabel(client)} control={<Checkbox size="small" disabled={busy} checked={assignmentClients.includes(client)} onChange={(_, checked) => setAssignmentClients(checked ? [...assignmentClients, client] : assignmentClients.filter((value) => value !== client))} />} />)}
          </Stack>
        </Box>
        {scopeID ? <Stack spacing={1} sx={{ pb: 1 }}>
          <Typography variant="subtitle2">{t("nodemgt.tpl_current_settings")}</Typography>
          {assignmentClients.map((client) => {
            const current = data.templates.find((row) => row.id === currentBinding(client));
            return <Stack key={client} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1, justifyContent: "space-between" }}>
              <Typography variant="body2">{clientLabel(client)}</Typography>
              <Typography variant="body2" color="text.secondary">{current?.name || inheritedTemplate(client)}</Typography>
            </Stack>;
          })}
          {bindingReady ? <Alert severity={assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id) ? "success" : "info"}>{t(assignmentClients.every((client) => currentBinding(client) === assignmentTemplate?.id) ? "nodemgt.tpl_already_applied" : "nodemgt.tpl_apply_summary", { name: assignmentTemplate?.name, target: rowLabel(scopes.find((row) => row.id === scopeID) || {id:scopeID}), clients: assignmentClients.map(clientLabel).join(", ") })}</Alert> : null}
        </Stack> : null}
      </SettingsSheetDialog>

      <SettingsSheetDialog open={Boolean(defaultTarget)} onClose={() => { if (!busy) { setDefaultTarget(null); setError(""); } }} disableClose={busy} title={t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_default" : "nodemgt.tpl_set_default")} actions={<>
        <Button disabled={busy} onClick={() => { setDefaultTarget(null); setError(""); }}>{t("cancel")}</Button>
        <Button variant="contained" disabled={busy} onClick={() => defaultTarget && setDefault(defaultTarget)}>{t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_confirm_unset" : "nodemgt.tpl_confirm_default")}</Button>
      </>}>
        <Typography>{t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_summary" : "nodemgt.tpl_default_summary", { name: defaultTarget?.name, clients: TEMPLATE_CLIENTS.filter((client) => kindOf(client) === defaultTarget?.kind).map(clientLabel).join(", ") })}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ pb: 2 }}>{t(defaultTarget && isDefault(defaultTarget) ? "nodemgt.tpl_unset_help" : "nodemgt.tpl_default_help")}</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
      </SettingsSheetDialog>

      <SettingsSheetDialog open={Boolean(discardAction)} onClose={() => setDiscardAction(null)} title={t("nodemgt.tpl_unsaved_title")} actions={<>
        <Button onClick={() => setDiscardAction(null)}>{t("nodemgt.tpl_keep_editing")}</Button>
        <Button color="error" onClick={() => { discardAction?.(); setDiscardAction(null); }}>{t("nodemgt.tpl_discard")}</Button>
      </>}><Typography sx={{ pb: 2 }}>{t("nodemgt.tpl_unsaved_help")}</Typography></SettingsSheetDialog>

      <SettingsSheetDialog open={Boolean(deleteTarget)} onClose={() => { if (!busy) { setDeleteTarget(null); setError(""); } }} disableClose={busy} title={t("nodemgt.delete")} actions={<>
        <Button disabled={busy} onClick={() => { setDeleteTarget(null); setError(""); }}>{t("cancel")}</Button>
        <Button color="error" variant="contained" disabled={busy} onClick={() => deleteTarget && void run(async () => {
          await call("admin:nodemgt.template.delete", { id: deleteTarget.id }); await reload(); setDeleteTarget(null);
        })}>{t("nodemgt.delete")}</Button>
      </>}>
        <Typography sx={{ pb: 2 }}>{t("nodemgt.tpl_delete_confirm", { name: deleteTarget?.name })}</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
      </SettingsSheetDialog>
    </>
  );
}
