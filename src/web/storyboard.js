/**
 * InspoVanna Storyboard — Multi-level creative planning
 * Episode/Scene: card grid | Shot: Vue Flow canvas
 * Nodes: text, image, video, audio — each with upload + generate
 * Edges: click to edit content based on source node type
 */
import {
    createApp, ref, reactive, computed,
    onMounted, onBeforeUnmount, nextTick, provide, h,
} from 'https://esm.sh/vue@3.5.13';
import htm from 'https://esm.sh/htm@3.1.1';
import {
    VueFlow, useVueFlow, Position, Handle as VfHandle,
} from 'https://esm.sh/@vue-flow/core@1.41.5?deps=vue@3.5.13';
import { Controls } from 'https://esm.sh/@vue-flow/controls@1.1.3?deps=vue@3.5.13';
import { Background } from 'https://esm.sh/@vue-flow/background@1.3.2?deps=vue@3.5.13';
import { MiniMap } from 'https://esm.sh/@vue-flow/minimap@1.5.2?deps=vue@3.5.13';

const html = htm.bind(h);

// ============================================================
// Utility
// ============================================================
function uid() { return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function emptyStoryboard() { return { version: '1.0.0', updatedAt: '', episodes: {}, flow: { nodes: [], edges: [] }, characters: {}, props: {}, scenes: {} }; }
function emptyEntity(id) { return { id, title: '', summary: '', notes: '', tags: [] }; }
function emptyShot(id, nodeType = 'text', title = '') {
    return {
        id, sceneId: '', title, summary: '', nodeType,
        properties: {
            text: { prompt: '' },
            image: { prompt: '', model: 'doubao-seedream-4-0-250828', size: '2048x2048', sizeTier: '2K', followInput: false, webSearch: false, workspaceAsset: null, history: [] },
            video: { prompt: '', model: 'doubao-seedance-2-0-260128', duration: 5, resolution: '1080p', aspect: '1:1', followInput: false, webSearch: false, workspaceAsset: null, history: [] },
            audio: { prompt: '', model: '', duration: 0, workspaceAsset: null, history: [] },
        },
    };
}

const DEFAULT_TITLES = { text: '提示词', image: '图像', video: '视频', audio: '音频' };

const IMAGE_MODEL_SIZES = {
    'doubao-seedream-4-0-250828': {
        '1K': [
            { value: '1024x1024', label: '1:1' }, { value: '864x1152', label: '3:4' },
            { value: '1152x864', label: '4:3' }, { value: '1312x736', label: '16:9' },
            { value: '736x1312', label: '9:16' }, { value: '832x1248', label: '2:3' },
            { value: '1248x832', label: '3:2' }, { value: '1568x672', label: '21:9' }
        ],
        '2K': [
            { value: '2048x2048', label: '1:1' }, { value: '1728x2304', label: '3:4' },
            { value: '2304x1728', label: '4:3' }, { value: '2848x1600', label: '16:9' },
            { value: '1600x2848', label: '9:16' }, { value: '1664x2496', label: '2:3' },
            { value: '2496x1664', label: '3:2' }, { value: '3136x1344', label: '21:9' }
        ],
        '4K': [
            { value: '4096x4096', label: '1:1' }, { value: '3520x4704', label: '3:4' },
            { value: '4704x3520', label: '4:3' }, { value: '5504x3040', label: '16:9' },
            { value: '3040x5504', label: '9:16' }, { value: '3328x4992', label: '2:3' },
            { value: '4992x3328', label: '3:2' }, { value: '6240x2656', label: '21:9' }
        ]
    },
    'doubao-seedream-4-5-251128': {
        '2K': [
            { value: '2048x2048', label: '1:1' }, { value: '1728x2304', label: '3:4' },
            { value: '2304x1728', label: '4:3' }, { value: '2848x1600', label: '16:9' },
            { value: '1600x2848', label: '9:16' }, { value: '2496x1664', label: '3:2' },
            { value: '1664x2496', label: '2:3' }, { value: '3136x1344', label: '21:9' }
        ],
        '4K': [
            { value: '4096x4096', label: '1:1' }, { value: '3520x4704', label: '3:4' },
            { value: '4704x3520', label: '4:3' }, { value: '5504x3040', label: '16:9' },
            { value: '3040x5504', label: '9:16' }, { value: '3328x4992', label: '2:3' },
            { value: '4992x3328', label: '3:2' }, { value: '6240x2656', label: '21:9' }
        ]
    },
    'doubao-seedream-5-0-260128': {
        '2K': [
            { value: '2048x2048', label: '1:1' }, { value: '1728x2304', label: '3:4' },
            { value: '2304x1728', label: '4:3' }, { value: '2848x1600', label: '16:9' },
            { value: '1600x2848', label: '9:16' }, { value: '2496x1664', label: '3:2' },
            { value: '1664x2496', label: '2:3' }, { value: '3136x1344', label: '21:9' }
        ],
        '3K': [
            { value: '3072x3072', label: '1:1' }, { value: '2592x3456', label: '3:4' },
            { value: '3456x2592', label: '4:3' }, { value: '4096x2304', label: '16:9' },
            { value: '2304x4096', label: '9:16' }, { value: '2496x3744', label: '2:3' },
            { value: '3744x2496', label: '3:2' }, { value: '4704x2016', label: '21:9' }
        ]
    }
};

function getImageSizeOpts(modelId, tier) {
    const model = IMAGE_MODEL_SIZES[modelId];
    if (!model) return [];
    const tiers = Object.keys(model);
    const t = tier && model[tier] ? tier : tiers[0];
    return model[t] || model[tiers[0]] || [];
}

const SB_ACTIONS = Symbol('sb-actions');

const FOLDER_MAP = { text: 'Text', image: 'Image', video: 'Video', audio: 'Audio' };
const ACCEPT_MAP = { text: '*/*', image: 'image/*', video: 'video/*', audio: 'audio/*' };
const STYLE_PRESETS = [
    { label: '商业插画', prompt: '商业插画风格，精致细节，色彩饱满，专业品质' },
    { label: '写实摄影', prompt: '专业棚拍摄影风格，真实质感，自然光影，高清细节' },
    { label: '赛博朋克', prompt: '赛博朋克科幻风格，霓虹光影，暗色调，未来科技感' },
    { label: '水彩手绘', prompt: '水彩手绘插画风，柔和笔触，淡雅色调，艺术感' },
    { label: '日系动漫', prompt: '日系动漫风格，精致线条，明亮色彩，二次元审美' },
    { label: '3D渲染', prompt: '3D高质量渲染风格，立体感强，材质细腻，光影真实' },
    { label: '自定义', prompt: '' },
];

// Connection limits per target handle: { sourceNodeType: maxCount }
const HANDLE_LIMITS = {
    'prompt-in': { text: 1 },         // image node: 1 prompt source
    'image-in': { image: 14 },        // image node: max 14 ref images
    'video-prompt-in': { text: 1 },   // video node: 1 prompt source
    'video-image-in': { image: 9 },   // video node: max 9 ref images
    'video-video-in': { video: 3 },   // video node: max 3 ref videos
    'video-audio-in': { audio: 3 },   // video node: max 3 ref audios
};

// ============================================================
// Shot node components
// ============================================================

const TextShotNode = {
    props: ['id', 'data', 'type'],
    inject: { act: { from: SB_ACTIONS } },
    render() {
        const d = this.data || {};
        const hasConn = this.act.hasOutput(this.id);
        return html`<div class="sb-node sb-node-shot sb-node-text">
            <button class="sb-node-close" title="删除节点" onClick=${e => { e.stopPropagation(); this.act.del(this.id); }}>✕</button>
            <div class="sb-node-header"><span class="sb-node-icon">\u{2728}</span><span class="sb-node-title">${d.title || '(未命名)'}</span></div>
            ${d.summary ? html`<div class="sb-node-summary">${d.summary}</div>` : null}
            ${d.assetUrl ? html`<div class="sb-node-thumb"><div style="padding:6px;font-size:11px;color:var(--text-muted)">\u{1F4C4} ${d.assetUrl.split('/').pop()}</div></div>` : null}
            <div class="sb-node-actions">
                <button class="sb-upload-btn" title="工作空间" onClick=${e => { e.stopPropagation(); this.act.upload(this.id); }}>\u{1F4C2}</button>
                <button class="sb-upload-btn" title="上传" onClick=${e => { e.stopPropagation(); this.act.uploadLocal(this.id); }}>\u{1F4E4}</button>
                <button class="sb-gen-btn" title="优化提示词" disabled=${!hasConn} onClick=${e => { e.stopPropagation(); this.act.optimize(this.id); }}>\u{2728}</button>
            </div>
            ${!hasConn ? html`<p style="font-size:10px;color:var(--text-secondary);margin:2px 0">请先连接到图像或视频节点</p>` : null}
            <${VfHandle} type="source" position=${Position.Right} id="prompt-out" style=${{ top: '50%' }} />
            <span class="sb-hl sb-hl-r" style=${{ top: '50%' }}>提示词</span>
        </div>`;
    },
};

const ImageShotNode = {
    props: ['id', 'data', 'type'],
    inject: { act: { from: SB_ACTIONS } },
    render() {
        const d = this.data || {};
        const hist = d.history || [];
        return html`<div class="sb-node sb-node-shot sb-node-image">
            <button class="sb-node-close" title="删除节点" onClick=${e => { e.stopPropagation(); this.act.del(this.id); }}>✕</button>
            <div class="sb-node-header"><span class="sb-node-icon">\u{1F5BC}️</span><span class="sb-node-title">${d.title || '(未命名)'}</span></div>
            ${d.generating ? html`<div class="sb-gen-progress"><span class="sb-spinner"></span><span>${d.genProgress || '生成中...'}</span></div>` : d.assetUrl ? html`<div class="sb-node-thumb" style="cursor:pointer" onClick=${e => { e.stopPropagation(); this.act.preview(this.id); }}><img src=${d.assetUrl} /></div>` : null}
            ${hist.length > 0 ? html`<div class="sb-history-bar">${hist.slice(-5).map(h => html`<div class=${'sb-history-item' + (h.selected ? ' active' : '')} onClick=${e => { e.stopPropagation(); this.act.selectHistory(this.id, h.path); }}><img src=${'/workspace/' + h.path} /></div>`)}</div>` : null}
            ${d.summary ? html`<div class="sb-node-summary">${d.summary}</div>` : null}
            <div class="sb-node-actions">
                <button class="sb-upload-btn" title="素材库" onClick=${e => { e.stopPropagation(); this.act.pickLibrary(this.id); }}>\u{1F3A8}</button>
                <button class="sb-upload-btn" title="工作空间" onClick=${e => { e.stopPropagation(); this.act.upload(this.id); }}>\u{1F4C2}</button>
                <button class="sb-upload-btn" title="上传" onClick=${e => { e.stopPropagation(); this.act.uploadLocal(this.id); }}>\u{1F4E4}</button>
                <button class="sb-gen-btn sb-gen-image" title="生成" disabled=${d.generating} onClick=${e => { e.stopPropagation(); this.act.generate(this.id); }}>\u{25B6}</button>
            </div>
            <${VfHandle} type="target" position=${Position.Left} id="prompt-in" style=${{ top: '25%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '25%' }}>提示词</span>
            <${VfHandle} type="target" position=${Position.Left} id="image-in" style=${{ top: '65%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '65%' }}>图片</span>
            <${VfHandle} type="source" position=${Position.Right} id="image-out" style=${{ top: '50%' }} />
            <span class="sb-hl sb-hl-r" style=${{ top: '50%' }}>图片</span>
        </div>`;
    },
};

const VideoShotNode = {
    props: ['id', 'data', 'type'],
    inject: { act: { from: SB_ACTIONS } },
    render() {
        const d = this.data || {};
        const hist = d.history || [];
        return html`<div class="sb-node sb-node-shot sb-node-video">
            <button class="sb-node-close" title="删除节点" onClick=${e => { e.stopPropagation(); this.act.del(this.id); }}>✕</button>
            <div class="sb-node-header"><span class="sb-node-icon">\u{1F3AC}</span><span class="sb-node-title">${d.title || '(未命名)'}</span>${d.duration ? html`<span class="sb-duration">${d.duration}s</span>` : null}</div>
            ${d.generating ? html`<div class="sb-gen-progress"><span class="sb-spinner"></span><span>${d.genProgress || '生成中...'}</span></div>` : d.assetUrl ? html`<div class="sb-node-thumb" style="cursor:pointer" onClick=${e => { e.stopPropagation(); this.act.preview(this.id); }}><video src=${d.assetUrl} muted preload="metadata"></video></div>` : null}
            ${hist.length > 0 ? html`<div class="sb-history-bar">${hist.slice(-5).map(h => html`<div class=${'sb-history-item' + (h.selected ? ' active' : '')} onClick=${e => { e.stopPropagation(); this.act.selectHistory(this.id, h.path); }}><video src=${'/workspace/' + h.path} muted preload="metadata" /></div>`)}</div>` : null}
            ${d.summary ? html`<div class="sb-node-summary">${d.summary}</div>` : null}
            <div class="sb-node-actions">
                <button class="sb-upload-btn" title="工作空间" onClick=${e => { e.stopPropagation(); this.act.upload(this.id); }}>\u{1F4C2}</button>
                <button class="sb-upload-btn" title="上传" onClick=${e => { e.stopPropagation(); this.act.uploadLocal(this.id); }}>\u{1F4E4}</button>
                ${d.hasAsset ? html`<button class="sb-upload-btn" title="导出首尾帧" disabled=${d.extracting} onClick=${e => { e.stopPropagation(); this.act.extractFrames(this.id); }}>\u{1F5BC}</button>` : null}
                <button class="sb-gen-btn sb-gen-video" title="生成" disabled=${d.generating} onClick=${e => { e.stopPropagation(); this.act.generate(this.id); }}>\u{25B6}</button>
            </div>
            <${VfHandle} type="target" position=${Position.Left} id="video-prompt-in" style=${{ top: '15%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '15%' }}>提示词</span>
            <${VfHandle} type="target" position=${Position.Left} id="video-image-in" style=${{ top: '38%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '38%' }}>图片</span>
            <${VfHandle} type="target" position=${Position.Left} id="video-video-in" style=${{ top: '62%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '62%' }}>视频</span>
            <${VfHandle} type="target" position=${Position.Left} id="video-audio-in" style=${{ top: '85%' }} />
            <span class="sb-hl sb-hl-l" style=${{ top: '85%' }}>音频</span>
            <${VfHandle} type="source" position=${Position.Right} id="video-out" style=${{ top: '40%' }} />
            <span class="sb-hl sb-hl-r" style=${{ top: '40%' }}>视频</span>
            <${VfHandle} type="source" position=${Position.Right} id="video-frame-out" style=${{ top: '70%' }} />
            <span class="sb-hl sb-hl-r" style=${{ top: '70%' }}>首尾帧</span>
        </div>`;
    },
};

const AudioShotNode = {
    props: ['id', 'data', 'type'],
    inject: { act: { from: SB_ACTIONS } },
    render() {
        const d = this.data || {};
        return html`<div class="sb-node sb-node-shot sb-node-audio">
            <button class="sb-node-close" title="删除节点" onClick=${e => { e.stopPropagation(); this.act.del(this.id); }}>✕</button>
            <div class="sb-node-header"><span class="sb-node-icon">\u{1F3B5}</span><span class="sb-node-title">${d.title || '(未命名)'}</span>${d.duration ? html`<span class="sb-duration">${d.duration}s</span>` : null}</div>
            ${d.assetUrl ? html`<div style="padding:4px 0;cursor:pointer" onClick=${e => { e.stopPropagation(); this.act.preview(this.id); }}><audio src=${d.assetUrl} controls style="width:100%;height:28px"></audio></div>` : null}
            ${d.summary ? html`<div class="sb-node-summary">${d.summary}</div>` : null}
            <div class="sb-node-actions">
                <button class="sb-upload-btn" title="工作空间" onClick=${e => { e.stopPropagation(); this.act.upload(this.id); }}>\u{1F4C2}</button>
                <button class="sb-upload-btn" title="上传" onClick=${e => { e.stopPropagation(); this.act.uploadLocal(this.id); }}>\u{1F4E4}</button>
            </div>
            <${VfHandle} type="source" position=${Position.Right} id="audio-out" style=${{ top: '50%' }} />
            <span class="sb-hl sb-hl-r" style=${{ top: '50%' }}>音频</span>
        </div>`;
    },
};

const SHOT_NODE_TYPES = { textShot: TextShotNode, imageShot: ImageShotNode, videoShot: VideoShotNode, audioShot: AudioShotNode };

// ============================================================
// Main Storyboard App
// ============================================================

const StoryboardApp = {
    setup() {
        const {
            fitView: vfFitView, addEdges: vfAddEdges, removeEdges: vfRemoveEdges,
            addNodes: vfAddNodes, removeNodes: vfRemoveNodes,
            setNodes: vfSetNodes, setEdges: vfSetEdges,
            getNodes: vfGetNodes, getEdges: vfGetEdges,
            getSelectedNodes: vfGetSelectedNodes,
        } = useVueFlow({
            selectionKeyCode: true,
            panOnDrag: [1],
            panActivationKeyCode: null,
            zoomOnScroll: true,
            zoomOnPinch: true,
            panOnScroll: false,
            deleteKeyCode: null,
        });

        const sbData = reactive(emptyStoryboard());
        const projectName = ref('');
        const projects = ref([]);
        const nav = reactive({ level: 'episode', episodeId: null, sceneId: null });
        const editTarget = ref(null);
        const tagsText = ref('');
        const treeVisible = ref(false);
        const treeExpandedIds = reactive(new Set());
        const assistantState = reactive({ show: false, input: '', messages: [], loading: false });
        let dirty = false, saveTimer = null;

        const currentEpisode = computed(() => nav.episodeId ? (sbData.episodes[nav.episodeId] || null) : null);
        const currentScene = computed(() => currentEpisode.value && nav.sceneId ? (currentEpisode.value.scenes?.[nav.sceneId] || null) : null);
        const hasProject = computed(() => !!projectName.value);

        function buildOneNode(sc, n) {
            const sh = sc.shots?.[n.data?.ref];
            const nt = sh?.nodeType || 'text';
            const p = sh?.properties || {};
            const fullSummary = sh?.summary || '';
            const prompt = nt === 'text' ? p.text?.prompt : nt === 'image' ? p.image?.prompt : nt === 'video' ? p.video?.prompt : '';
            // Generate short display summary: prefer explicit summary, else truncate prompt
            let displaySummary = '';
            if (fullSummary && fullSummary !== prompt) {
                displaySummary = fullSummary.length > 50 ? fullSummary.substring(0, 50) + '…' : fullSummary;
            } else if (prompt) {
                displaySummary = prompt.length > 50 ? prompt.substring(0, 50) + '…' : prompt;
            }
            const nodeData = {
                ref: n.data?.ref, title: sh?.title || '', summary: displaySummary, nodeType: nt,
                duration: nt === 'video' ? p.video?.duration : nt === 'audio' ? p.audio?.duration : null,
                generating: n.data?.generating || false, genProgress: n.data?.genProgress || '',
                extracting: n.data?.extracting || false,
                history: (nt === 'image' ? p.image?.history : nt === 'video' ? p.video?.history : nt === 'audio' ? p.audio?.history : []) || [],
            };
            if (nt === 'image' && p.image?.workspaceAsset) nodeData.assetUrl = '/workspace/' + p.image.workspaceAsset;
            if (nt === 'video' && p.video?.workspaceAsset) { nodeData.assetUrl = '/workspace/' + p.video.workspaceAsset; nodeData.hasAsset = true; }
            if (nt === 'audio' && p.audio?.workspaceAsset) nodeData.assetUrl = '/workspace/' + p.audio.workspaceAsset;
            if (nt === 'text' && p.text?.workspaceAsset) nodeData.assetUrl = '/workspace/' + p.text.workspaceAsset;
            return { id: n.id, type: nt + 'Shot', position: { ...n.position }, data: nodeData };
        }
        function buildShotNodes() { const sc = currentScene.value; return sc ? (sc.flow?.nodes || []).map(n => buildOneNode(sc, n)) : []; }

        const EDGE_COLORS = { text: '#a78bfa', image: '#f472b6', video: '#34d399', audio: '#a78bfa' };
        function syncFlowToVueFlow() {
            if (nav.level !== 'shot') return;
            vfSetNodes(buildShotNodes());
            const edges = (currentScene.value?.flow?.edges || []).map(e => ({
                ...e,
                style: { stroke: EDGE_COLORS[e.data?.sourceType] || '#94a3b8', strokeWidth: 2 },
                animated: e.animated !== false,
            }));
            vfSetEdges(edges);
            nextTick(() => requestAnimationFrame(() => vfFitView({ padding: 0.2 })));
        }
        function syncNodeToFlow(nodeId) {
            if (nav.level !== 'shot') return;
            const sc = currentScene.value; if (!sc) return;
            const flowNode = sc.flow.nodes.find(n => n.id === nodeId);
            if (!flowNode) return;
            const existing = vfGetNodes.value.find(n => n.id === nodeId);
            if (existing) { const r = buildOneNode(sc, flowNode); existing.data = r.data; if (existing.type !== r.type) existing.type = r.type; }
        }
        function saveFlowFromVueFlow() {
            if (nav.level !== 'shot') return;
            const sc = currentScene.value; if (!sc) return;
            sc.flow.nodes = vfGetNodes.value.map(n => ({ id: n.id, type: n.type, position: { ...n.position }, data: { ...n.data } }));
            sc.flow.edges = vfGetEdges.value.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, animated: e.animated, data: e.data ? { ...e.data } : undefined }));
        }

        // Navigation
        function navigate(level) { saveFlowFromVueFlow(); if (level === 'episode') { nav.level = 'episode'; nav.episodeId = null; nav.sceneId = null; } else if (level === 'scene') { nav.level = 'scene'; nav.sceneId = null; } editTarget.value = null; syncFlowToVueFlow(); }
        function drillDown(entityId) { saveFlowFromVueFlow(); if (nav.level === 'episode') { nav.level = 'scene'; nav.episodeId = entityId; nav.sceneId = null; } else if (nav.level === 'scene') { nav.level = 'shot'; nav.sceneId = entityId; } editTarget.value = null; syncFlowToVueFlow(); }
        function treeNav(episodeId, sceneId) {
            saveFlowFromVueFlow();
            if (sceneId) {
                nav.level = 'shot'; nav.episodeId = episodeId; nav.sceneId = sceneId;
            } else if (episodeId) {
                nav.level = 'scene'; nav.episodeId = episodeId; nav.sceneId = null;
            } else {
                nav.level = 'episode'; nav.episodeId = null; nav.sceneId = null;
            }
            editTarget.value = null;
            treeVisible.value = false;
            syncFlowToVueFlow();
        }
        function toggleTreeExpand(epId, e) {
            e.stopPropagation();
            if (treeExpandedIds.has(epId)) treeExpandedIds.delete(epId);
            else treeExpandedIds.add(epId);
        }
        function openAssistant() { assistantState.show = true; assistantState.input = ''; }
        function closeAssistant() { assistantState.show = false; }
        function clearAssistant() { if (assistantState.messages.length && !confirm('确定清空聊天记录？')) return; assistantState.messages = []; }
        async function sendAssistantMessage() {
            const msg = assistantState.input.trim();
            if (!msg || assistantState.loading) return;
            assistantState.messages.push({ role: 'user', content: msg });
            assistantState.input = '';
            assistantState.loading = true;
            try {
                const apiKey = window.state?.arkApiKey;
                const model = window.state?.models?.text_default || 'doubao-seed-2-0-pro-260215';
                if (!apiKey) throw new Error('请先在设置中配置 API Key');
                const systemCtx = `你是 InspoVanna StoryBoard 的 AI 助手，名叫"想象"，帮助用户进行剧本创作、分镜设计、提示词优化等。当被问及名字时，请回答你叫"想象"。当前项目: ${projectName.value || '未选择'}，当前层级: ${nav.level === 'episode' ? '剧集' : nav.level === 'scene' ? '场景' : '分镜'}${currentEpisode.value ? '，剧集: ' + currentEpisode.value.title : ''}${currentScene.value ? '，场景: ' + currentScene.value.title : ''}。请简洁专业地回答。`;
                const apiMessages = [{ role: 'system', content: systemCtx }, ...assistantState.messages.slice(-20)];
                const r = await fetch('/api/ark/chat', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: apiMessages })
                });
                const data = await r.json();
                if (data.error) throw new Error(data.error);
                const reply = data.choices?.[0]?.message?.content || data.output?.[0]?.content?.[0]?.text || '（无回复）';
                assistantState.messages.push({ role: 'assistant', content: reply });
            } catch (e) {
                assistantState.messages.push({ role: 'assistant', content: '❌ ' + e.message });
            } finally { assistantState.loading = false; }
        }

        // CRUD
        function addEntity(nodeType) {
            if (!hasProject.value) return;
            const id = uid();
            if (nav.level === 'episode') { sbData.episodes[id] = { ...emptyEntity(id), scriptText: '', scenes: {}, flow: { nodes: [], edges: [] } }; }
            else if (nav.level === 'scene') { const ep = currentEpisode.value; if (!ep) return; ep.scenes[id] = { ...emptyEntity(id), scriptText: '', episodeId: nav.episodeId, shots: {}, flow: { nodes: [], edges: [] } }; }
            else {
                const sc = currentScene.value; if (!sc) return;
                const nt = nodeType || 'text', pos = { x: Math.random() * 400 + 50, y: Math.random() * 300 + 50 };
                // Default title with type-based counting
                const sameTypeCount = Object.values(sc.shots).filter(s => s.nodeType === nt).length + 1;
                const title = DEFAULT_TITLES[nt] + ' ' + sameTypeCount;
                sc.shots[id] = { ...emptyShot(id, nt, title), sceneId: nav.sceneId };
                sc.flow.nodes.push({ id, type: nt + 'Shot', position: pos, data: { ref: id } });
                vfAddNodes([buildOneNode(sc, sc.flow.nodes[sc.flow.nodes.length - 1])]);
                markDirty(); return;
            }
            markDirty();
        }
        function deleteEntity(entityId) {
            if (nav.level === 'shot') { saveFlowFromVueFlow(); const sc = currentScene.value; if (!sc) return; delete sc.shots[entityId]; sc.flow.nodes = sc.flow.nodes.filter(n => n.id !== entityId); sc.flow.edges = sc.flow.edges.filter(e => e.source !== entityId && e.target !== entityId); vfRemoveNodes([entityId]); }
            else if (nav.level === 'episode') { delete sbData.episodes[entityId]; sbData.flow.nodes = sbData.flow.nodes.filter(n => n.id !== entityId); sbData.flow.edges = sbData.flow.edges.filter(e => e.source !== entityId && e.target !== entityId); }
            else { const ep = currentEpisode.value; if (!ep) return; delete ep.scenes[entityId]; ep.flow.nodes = ep.flow.nodes.filter(n => n.id !== entityId); ep.flow.edges = ep.flow.edges.filter(e => e.source !== entityId && e.target !== entityId); }
            if (editTarget.value && editTarget.value.id === entityId) editTarget.value = null;
            markDirty();
        }

        // Edit
        function startEdit(entityId) {
            let type, data;
            if (nav.level === 'episode') { const ep = sbData.episodes[entityId]; if (!ep) return; type = 'episode'; data = ep; }
            else if (nav.level === 'scene') { const ep = currentEpisode.value; if (!ep || !ep.scenes[entityId]) return; type = 'scene'; data = ep.scenes[entityId]; }
            else { const sc = currentScene.value; if (!sc || !sc.shots[entityId]) return; type = 'shot'; data = sc.shots[entityId]; }
            editTarget.value = { type, id: entityId, data }; tagsText.value = (data.tags || []).join(' ');
        }
        function startEditEdge(edgeId) {
            const sc = currentScene.value; if (!sc) return;
            const edge = sc.flow.edges.find(e => e.id === edgeId); if (!edge) return;
            const srcNode = sc.flow.nodes.find(n => n.id === edge.source);
            const srcShot = srcNode ? sc.shots[srcNode.data?.ref] : null;
            const srcType = srcShot?.nodeType || 'text';
            editTarget.value = { type: 'edge', id: edgeId, data: edge.data || {}, edge, srcType };
        }
        function closeEdit() { saveIfNeeded(); editTarget.value = null; }
        function markDirty() { dirty = true; if (editTarget.value && nav.level === 'shot') syncNodeToFlow(editTarget.value.id); clearTimeout(saveTimer); saveTimer = setTimeout(() => saveIfNeeded(), 500); }
        function updateTags() { if (!editTarget.value) return; editTarget.value.data.tags = tagsText.value.split(/\s+/).filter(Boolean); markDirty(); }

        // Edit helpers
        function onEditField(f, e) { if (editTarget.value?.data) { editTarget.value.data[f] = e.target.value; markDirty(); } }
        function onPropField(nt, f, e) { if (editTarget.value?.data?.properties?.[nt]) { editTarget.value.data.properties[nt][f] = e.target.value; markDirty(); } }
        function onTagsInput(e) { tagsText.value = e.target.value; updateTags(); }
        function onNodeTypeChange(e) { if (editTarget.value?.data) { editTarget.value.data.nodeType = e.target.value; markDirty(); const n = vfGetNodes.value.find(n => n.id === editTarget.value.id); if (n) n.type = e.target.value + 'Shot'; } }
        function onDurationChange(e) { if (editTarget.value?.data?.properties?.video) { editTarget.value.data.properties.video.duration = Number(e.target.value); markDirty(); } if (editTarget.value?.data?.properties?.audio) { editTarget.value.data.properties.audio.duration = Number(e.target.value); markDirty(); } }
        function onModelChange(nt, e) { if (editTarget.value?.data?.properties?.[nt]) { editTarget.value.data.properties[nt].model = e.target.value; markDirty(); } }
        // Edge edit helpers
        function onEdgeTextField(f, e) { if (editTarget.value?.data) { editTarget.value.data[f] = e.target.value; markDirty(); } }

        // Upload — workspace picker
        function uploadAsset(nodeId) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh) return;
            const nt = sh.nodeType || 'text';
            const folder = FOLDER_MAP[nt] || '';
            if (typeof window.showWorkspaceFilePicker === 'function') {
                window.showWorkspaceFilePicker(folder, (file) => {
                    const relPath = file.url.replace(/^\/workspace\//, '');
                    sh.properties[nt].workspaceAsset = relPath;
                    syncNodeToFlow(nodeId); markDirty();
                    window.showToast && window.showToast('已关联工作空间文件', 'success');
                });
            }
        }

        // Upload — local file
        function uploadLocal(nodeId) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh) return;
            const nt = sh.nodeType || 'text';
            const folder = FOLDER_MAP[nt] || '';
            const input = document.createElement('input');
            input.type = 'file'; input.accept = ACCEPT_MAP[nt] || '*/*';
            input.onchange = async () => {
                const file = input.files[0]; if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('project', projectName.value || '');
                formData.append('subdir', (projectName.value || '') + '/' + folder);
                try {
                    const resp = await fetch('/api/workspace/upload', { method: 'POST', body: formData });
                    if (resp.ok) {
                        const result = await resp.json();
                        const relPath = (result.serveUrl || '').replace(/^\/workspace\//, '') || (projectName.value + '/' + folder + '/' + file.name);
                        sh.properties[nt].workspaceAsset = relPath;
                        syncNodeToFlow(nodeId); markDirty();
                        window.showToast && window.showToast('上传成功', 'success');
                    } else { window.showToast && window.showToast('上传失败', 'error'); }
                } catch (e) { window.showToast && window.showToast('上传失败', 'error'); }
            };
            input.click();
        }

        // Pick from library (characters, props, scenes)
        function pickFromLibrary(nodeId) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh) return;
            const nt = sh.nodeType || 'image';
            // Collect all library items with images
            const items = [];
            for (const c of Object.values(sbData.characters || {})) {
                if (c.imageAsset) items.push({ name: c.name, path: c.imageAsset, type: '角色' });
            }
            for (const p of Object.values(sbData.props || {})) {
                if (p.imageAsset) items.push({ name: p.name, path: p.imageAsset, type: '道具' });
            }
            for (const s of Object.values(sbData.scenes || {})) {
                if (s.imageAsset) items.push({ name: s.name, path: s.imageAsset, type: '场景' });
            }
            if (!items.length) { window.showToast && window.showToast('素材库中暂无带参考图的素材', 'warning'); return; }
            // Show a simple picker popup
            const existing = document.getElementById('sb-lib-picker');
            if (existing) existing.remove();
            const overlay = document.createElement('div');
            overlay.id = 'sb-lib-picker';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:1000;display:flex;align-items:center;justify-content:center';
            overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
            const popup = document.createElement('div');
            popup.style.cssText = 'background:var(--dialog-bg);border-radius:12px;padding:16px;max-width:400px;width:90%;max-height:60vh;overflow-y:auto;box-shadow:var(--shadow-lg)';
            popup.innerHTML = '<h4 style="margin:0 0 12px;font-size:14px;color:var(--text-primary)">选择素材库图片</h4>' +
                items.map((item, i) => `<div data-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''"><img src="/workspace/${item.path}" style="width:40px;height:40px;border-radius:4px;object-fit:cover" /><div><div style="font-size:12px;font-weight:500;color:var(--text-primary)">${item.name}</div><div style="font-size:11px;color:var(--text-secondary)">${item.type}</div></div></div>`).join('');
            popup.querySelectorAll('[data-idx]').forEach(el => {
                el.onclick = () => {
                    const idx = parseInt(el.dataset.idx);
                    const item = items[idx];
                    sh.properties[nt].workspaceAsset = item.path;
                    syncNodeToFlow(nodeId); markDirty();
                    overlay.remove();
                    window.showToast && window.showToast('已关联: ' + item.name, 'success');
                };
            });
            overlay.appendChild(popup);
            document.body.appendChild(overlay);
        }

        // Generate
        function getConnectedPrompt(nodeId) {
            const sc = currentScene.value; if (!sc) return '';
            const promptEdges = sc.flow.edges.filter(e => e.target === nodeId && (e.targetHandle === 'prompt-in' || e.targetHandle === 'video-prompt-in'));
            const prompts = [];
            for (const edge of promptEdges) {
                const srcNode = sc.flow.nodes.find(n => n.id === edge.source);
                if (!srcNode) continue;
                const srcShot = sc.shots[srcNode.data?.ref];
                if (srcShot?.properties?.text?.prompt) prompts.push(srcShot.properties.text.prompt);
            }
            return prompts.join('\n');
        }

        function generateFromShot(shotNodeId) {
            saveFlowFromVueFlow(); const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[shotNodeId]; if (!sh) return;
            const nt = sh.nodeType, p = sh.properties || {}, ps = window.state || {};
            const apiKey = ps?.arkApiKey;
            if (!apiKey) { window.showToast && window.showToast('请先配置API密钥', 'error'); return; }
            const extPrompt = getConnectedPrompt(shotNodeId);
            const folder = FOLDER_MAP[nt] || '';
            const nodeDir = (projectName.value || '') + '/' + folder + '/' + (sh.title || shotNodeId);

            if (nt === 'image') {
                const prompt = p.image?.prompt || extPrompt;
                if (!prompt) { window.showToast && window.showToast('请先输入或连接提示词', 'warning'); return; }
                doImageGenerate(shotNodeId, prompt, p.image, apiKey, nodeDir);
            }
            else if (nt === 'video') {
                const prompt = p.video?.prompt || extPrompt;
                if (!prompt) { window.showToast && window.showToast('请先输入或连接提示词', 'warning'); return; }
                doVideoGenerate(shotNodeId, prompt, p.video, apiKey, nodeDir);
            }
            else { window.showToast && window.showToast('提示词节点不支持直接生成', 'warning'); }
        }

        // In-page image generation
        async function doImageGenerate(nodeId, prompt, imgProps, apiKey, nodeDir) {
            setNodeGenerating(nodeId, true, '生成中...');
            try {
                await ensureDir(nodeDir);
                // Collect connected reference images
                const sc = currentScene.value;
                const refImages = [];
                const refDescs = [];
                for (const edge of sc.flow.edges) {
                    if (edge.target !== nodeId) continue;
                    if (edge.targetHandle !== 'image-in') continue;
                    const srcNode = sc.flow.nodes.find(n => n.id === edge.source);
                    if (!srcNode) continue;
                    const srcShot = sc.shots[srcNode.data?.ref];
                    if (!srcShot) continue;
                    const asset = srcShot.properties[srcShot.nodeType]?.workspaceAsset;
                    if (asset) {
                        refImages.push({ url: '/workspace/' + asset, path: asset });
                        refDescs.push(srcShot.title || srcShot.nodeType);
                    }
                }
                // Auto-append reference descriptions to prompt
                if (refDescs.length > 0) {
                    const refText = refDescs.map((d, i) => `图片${i + 1}为${d}`).join('，');
                    prompt = prompt + '\n\n参考素材说明：' + refText + '。';
                }
                let size = imgProps.size || '2048x2048';
                // If followInput, get size from first connected image
                if (imgProps.followInput && refImages.length > 0) {
                    try {
                        const img = new Image();
                        img.src = refImages[0].url;
                        await new Promise((r, j) => { img.onload = r; img.onerror = j; setTimeout(j, 5000); });
                        if (img.naturalWidth && img.naturalHeight) size = img.naturalWidth + 'x' + img.naturalHeight;
                    } catch (e) {}
                }
                const body = { model: imgProps.model || 'doubao-seedream-4-0-250828', prompt, size, response_format: 'url', sequential_image_generation: 'disabled' };
                if (imgProps.webSearch && imgProps.model === 'doubao-seedream-5-0-260128') body.tools = [{ type: 'web_search' }];
                // Upload ref images to TOS and include in request
                if (refImages.length > 0) {
                    const uploadedUrls = [];
                    for (const ri of refImages) {
                        try {
                            // Fetch workspace file as blob, then upload to TOS
                            const imgResp = await fetch(ri.url);
                            if (!imgResp.ok) throw new Error('fetch failed');
                            const blob = await imgResp.blob();
                            const fname = ri.path.split('/').pop() || 'ref.png';
                            const formData = new FormData();
                            formData.append('file', blob, fname);
                            const upR = await fetch('/api/tos/upload', { method: 'POST', body: formData });
                            if (upR.ok) { const ud = await upR.json(); if (ud.url) { uploadedUrls.push(ud.url); continue; } }
                        } catch (e) { console.warn('Ref upload failed, using workspace URL:', e); }
                        uploadedUrls.push(ri.url);
                    }
                    if (uploadedUrls.length === 1) body.image = uploadedUrls[0];
                    else if (uploadedUrls.length > 1) body.image = uploadedUrls;
                }
                const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                    body: JSON.stringify(body)
                });
                if (!r.ok) { const t = await r.text(); throw new Error('API错误: ' + t); }
                const data = await r.json();
                if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
                if (!data.data?.length) throw new Error('API未返回图像');
                const imgUrl = data.data[0].url || (data.data[0].b64_json ? 'data:image/png;base64,' + data.data[0].b64_json : null);
                if (!imgUrl) throw new Error('无图像URL');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = 'image_' + ts + '.png';
                const saveR = await fetch('/api/workspace/save', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: imgUrl, filename, subdir: nodeDir })
                });
                let relPath;
                if (saveR.ok) { const sd = await saveR.json(); relPath = sd.path || (nodeDir + '/' + filename); }
                else { relPath = nodeDir + '/' + filename; }
                const sh = sc.shots[nodeId];
                if (!sh) return;
                const hist = sh.properties.image.history || [];
                hist.forEach(h => h.selected = false);
                hist.push({ path: relPath, timestamp: new Date().toISOString(), selected: true });
                sh.properties.image.history = hist;
                sh.properties.image.workspaceAsset = relPath;
                syncNodeToFlow(nodeId); markDirty();
                generateSummary(nodeId);
                window.showToast && window.showToast('图像生成成功', 'success');
            } catch (e) {
                console.error('Image gen error:', e);
                window.showToast && window.showToast('图像生成失败: ' + e.message, 'error');
            } finally {
                setNodeGenerating(nodeId, false);
            }
        }

        // In-page video generation
        async function doVideoGenerate(nodeId, prompt, vidProps, apiKey, nodeDir) {
            setNodeGenerating(nodeId, true, '提交任务...');
            try {
                await ensureDir(nodeDir);
                // Collect connected assets
                const sc = currentScene.value;
                const images = [], videos = [], audio = [];
                const imageDescs = [], videoDescs = [], audioDescs = [];
                for (const edge of sc.flow.edges) {
                    if (edge.target !== nodeId) continue;
                    const srcNode = sc.flow.nodes.find(n => n.id === edge.source);
                    if (!srcNode) continue;
                    const srcShot = sc.shots[srcNode.data?.ref];
                    if (!srcShot) continue;
                    const nt = srcShot.nodeType;
                    const asset = srcShot.properties[nt]?.workspaceAsset;
                    if (!asset) continue;
                    const url = '/workspace/' + asset;
                    const name = srcShot.title || nt;
                    if (edge.targetHandle === 'video-image-in') {
                        const role = edge.data?.imageRole === 'firstFrame' ? 'first_frame' : edge.data?.imageRole === 'lastFrame' ? 'last_frame' : 'reference_image';
                        images.push({ url, role });
                        const roleLabel = role === 'first_frame' ? '首帧' : role === 'last_frame' ? '尾帧' : '参考图';
                        imageDescs.push(`${name}（${roleLabel}）`);
                    } else if (edge.targetHandle === 'video-video-in') {
                        videos.push({ url, role: 'reference_video' });
                        videoDescs.push(`${name}（参考视频）`);
                    } else if (edge.targetHandle === 'video-audio-in') {
                        audio.push({ url, role: 'reference_audio' });
                        audioDescs.push(`${name}（参考音频）`);
                    }
                }
                // Auto-append reference descriptions to prompt
                const allDescs = [];
                if (images.length > 0) {
                    images.forEach((img, i) => {
                        allDescs.push(`图片${i + 1}为${imageDescs[i]}`);
                    });
                }
                if (videos.length > 0) {
                    videos.forEach((v, i) => {
                        allDescs.push(`视频${i + 1}为${videoDescs[i]}`);
                    });
                }
                if (audio.length > 0) {
                    audio.forEach((a, i) => {
                        allDescs.push(`音频${i + 1}为${audioDescs[i]}`);
                    });
                }
                if (allDescs.length > 0) {
                    prompt = prompt + '\n\n参考素材说明：' + allDescs.join('，') + '。';
                }
                // Resolve resolution and ratio
                let resolution = vidProps.resolution || '1080p';
                let ratio = vidProps.aspect || '1:1';
                if (vidProps.followInput && images.length > 0) {
                    try {
                        const img = new Image();
                        img.src = images[0].url;
                        await new Promise((r, j) => { img.onload = r; img.onerror = j; setTimeout(j, 5000); });
                        const w = img.naturalWidth, h = img.naturalHeight;
                        if (w && h) {
                            const g = (a, b) => { while (b) { [a, b] = [b, a % b]; } return a; };
                            const g2 = g(w, h);
                            ratio = (w / g2) + ':' + (h / g2);
                            resolution = w >= 1920 ? '1080p' : w >= 1280 ? '720p' : '480p';
                        } else { resolution = vidProps.resolution || '1080p'; }
                    } catch (e) { resolution = vidProps.resolution || '1080p'; }
                } else if (vidProps.followInput) { resolution = vidProps.resolution || '1080p'; }
                const r = await fetch('/api/video/generate', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: vidProps.model || 'doubao-seedance-2-0-260128',
                        prompt, ratio, duration: vidProps.duration || 5, resolution,
                        watermark: false, images, videos, audio,
                        tools: vidProps.webSearch ? [{ type: 'web_search' }] : undefined,
                    })
                });
                if (!r.ok) { const t = await r.json().catch(() => ({})); throw new Error(t.error || '服务器错误'); }
                const taskData = await r.json();
                const taskId = taskData.id;
                if (!taskId) throw new Error('未返回任务ID');
                window.showToast && window.showToast('视频生成任务已提交', 'success');
                // Poll
                let pollCount = 0;
                while (pollCount < 120) {
                    await new Promise(r => setTimeout(r, 5000));
                    pollCount++;
                    const sr = await fetch('/api/video/status?task_id=' + taskId);
                    if (!sr.ok) continue;
                    const sd = await sr.json();
                    const status = sd.status || '';
                    setNodeGenerating(nodeId, true, '生成中... (' + (pollCount * 5) + 's)');
                    if (status === 'succeeded') {
                        const videoUrl = sd.content?.video_url || sd.video_url || '';
                        if (!videoUrl) throw new Error('未获取到视频URL');
                        const ts = new Date().toISOString().replace(/[:.]/g, '-');
                        const filename = 'video_' + ts + '.mp4';
                        const saveR = await fetch('/api/workspace/save', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: videoUrl, filename, subdir: nodeDir })
                        });
                        let relPath;
                        if (saveR.ok) { const s = await saveR.json(); relPath = s.path || (nodeDir + '/' + filename); }
                        else { relPath = nodeDir + '/' + filename; }
                        const sh = sc.shots[nodeId];
                        const hist = sh.properties.video.history || [];
                        hist.forEach(h => h.selected = false);
                        hist.push({ path: relPath, timestamp: new Date().toISOString(), selected: true });
                        sh.properties.video.history = hist;
                        sh.properties.video.workspaceAsset = relPath;
                        syncNodeToFlow(nodeId); markDirty();
                        generateSummary(nodeId);
                        window.showToast && window.showToast('视频生成成功', 'success');
                        return;
                    }
                    if (status === 'failed') throw new Error(sd.error?.message || '生成失败');
                }
                throw new Error('生成超时');
            } catch (e) {
                console.error('Video gen error:', e);
                window.showToast && window.showToast('视频生成失败: ' + e.message, 'error');
            } finally {
                setNodeGenerating(nodeId, false);
            }
        }

        function setNodeGenerating(nodeId, generating, progress) {
            const node = vfGetNodes.value.find(n => n.id === nodeId);
            if (node) {
                node.data = { ...node.data, generating, genProgress: progress || '' };
            }
        }

        async function ensureDir(dir) {
            const parts = dir.split('/');
            for (let i = 1; i <= parts.length; i++) {
                await fetch('/api/workspace/mkdir', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: parts.slice(0, i).join('/') })
                }).catch(() => {});
            }
        }

        // Prompt optimization
        const optimizeState = reactive({ loading: false, original: '', optimized: '', nodeId: null, show: false });
        const previewState = reactive({ show: false, type: '', url: '', title: '' });

        function openPreview(nodeIdOrOpts) {
            if (typeof nodeIdOrOpts === 'object') {
                previewState.type = nodeIdOrOpts.type || 'image';
                previewState.url = nodeIdOrOpts.url || '';
                previewState.title = nodeIdOrOpts.title || '';
                previewState.show = true;
                return;
            }
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeIdOrOpts]; if (!sh) return;
            const nt = sh.nodeType;
            const assetPath = sh.properties[nt]?.workspaceAsset;
            if (!assetPath) return;
            previewState.type = nt;
            previewState.url = '/workspace/' + assetPath;
            previewState.title = sh.title || assetPath.split('/').pop();
            previewState.show = true;
        }
        function closePreview() { previewState.show = false; previewState.type = ''; previewState.url = ''; }
        async function optimizePrompt(nodeId) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh || sh.nodeType !== 'text') return;
            const prompt = sh.properties.text?.prompt;
            if (!prompt || !prompt.trim()) { window.showToast && window.showToast('请先输入提示词', 'warning'); return; }
            const ps = window.state || {};
            const apiKey = ps.arkApiKey;
            const model = ps.currentModel;
            if (!apiKey || !model) { window.showToast && window.showToast('请先在设置中配置API密钥和模型', 'error'); return; }
            optimizeState.loading = true;
            optimizeState.original = prompt;
            optimizeState.nodeId = nodeId;
            optimizeState.show = true;
            optimizeState.optimized = '';
            try {
                // Detect target type from connected edges
                const sc2 = currentScene.value;
                const connEdges = sc2?.flow?.edges?.filter(e => e.source === nodeId) || [];
                const toVideo = connEdges.some(e => e.targetHandle === 'video-prompt-in');
                const toImage = connEdges.some(e => e.targetHandle === 'prompt-in');
                let sysMsg;
                if (toVideo && !toImage) {
                    sysMsg = '你是一个专业的AI视频提示词优化专家。请将用户的提示词优化为适合AI视频生成的描述。要求：1.保留原始意图和核心内容；2.详细描述画面运动、镜头变化、时间流逝等动态元素；3.描述场景氛围、光影变化、色调；4.补充视频风格和画质相关描述；5.保持用户输入的原始语言，不要翻译；6.直接输出优化结果，不要解释。';
                } else {
                    sysMsg = '你是一个专业的AI图像提示词优化专家。请将用户的提示词优化为适合AI图像生成的描述。要求：1.保留原始意图和核心内容；2.增强视觉细节描述（光线、色彩、构图、氛围）；3.补充画面风格、材质质感和画质相关描述；4.保持用户输入的原始语言，不要翻译；5.直接输出优化结果，不要解释。';
                }
                const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model,
                        input: [
                            { role: 'system', content: [{ type: 'input_text', text: sysMsg }] },
                            { role: 'user', content: [{ type: 'input_text', text: prompt }] }
                        ]
                    }),
                });
                if (r.ok) {
                    const data = await r.json();
                    let content = '';
                    if (data.output && Array.isArray(data.output)) {
                        for (const item of data.output) {
                            if (item.type === 'message' && item.content) {
                                for (const c of (Array.isArray(item.content) ? item.content : [item.content])) {
                                    if (c.type === 'output_text' && c.text) content += c.text;
                                }
                            }
                        }
                    }
                    optimizeState.optimized = content || '(无优化结果)';
                } else {
                    optimizeState.optimized = '(优化失败)';
                    window.showToast && window.showToast('优化请求失败', 'error');
                }
            } catch (e) {
                optimizeState.optimized = '(优化出错)';
                window.showToast && window.showToast('优化请求出错', 'error');
            }
            optimizeState.loading = false;
        }
        function acceptOptimize() {
            if (!optimizeState.nodeId || !optimizeState.optimized) return;
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[optimizeState.nodeId]; if (!sh) return;
            sh.properties.text.prompt = optimizeState.optimized;
            syncNodeToFlow(optimizeState.nodeId);
            optimizeState.show = false;
            markDirty();
            window.showToast && window.showToast('已替换提示词', 'success');
        }
        function rejectOptimize() { optimizeState.show = false; }

        async function generateSummary(nodeId) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh) return;
            const nt = sh.nodeType;
            const prompt = nt === 'text' ? sh.properties.text?.prompt : nt === 'image' ? sh.properties.image?.prompt : nt === 'video' ? sh.properties.video?.prompt : '';
            if (!prompt || !prompt.trim()) return;
            const ps = window.state || {};
            const apiKey = ps.arkApiKey;
            const model = ps.currentModel;
            if (!apiKey || !model) return;
            try {
                const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({
                        model,
                        input: [
                            { role: 'system', content: [{ type: 'input_text', text: '你是一个简洁的内容摘要专家。请用一句简短的中文概括以下提示词的核心内容（不超过20个字）。只输出摘要，不要解释。' }] },
                            { role: 'user', content: [{ type: 'input_text', text: prompt }] }
                        ]
                    }),
                });
                if (r.ok) {
                    const data = await r.json();
                    let content = '';
                    if (data.output && Array.isArray(data.output)) {
                        for (const item of data.output) {
                            if (item.type === 'message' && item.content) {
                                for (const c of (Array.isArray(item.content) ? item.content : [item.content])) {
                                    if (c.type === 'output_text' && c.text) content += c.text;
                                }
                            }
                        }
                    }
                    if (content) {
                        sh.summary = content.trim().replace(/^["「」]|["「」]$/g, '');
                        syncNodeToFlow(nodeId); markDirty();
                    }
                }
            } catch (e) { console.error('Summary gen error:', e); }
        }

        // Project
        async function loadProjects() { try { const r = await fetch('/api/workspace/projects'); if (r.ok) projects.value = (await r.json()).projects || []; } catch (e) { console.error(e); } }
        async function selectProject(name) {
            saveIfNeeded(); projectName.value = name; nav.level = 'episode'; nav.episodeId = null; nav.sceneId = null; editTarget.value = null;
            const ps = window.state || {}; if (ps.currentProject !== undefined) ps.currentProject = name;
            try { const r = await fetch('/api/storyboard?project=' + encodeURIComponent(name)); if (r.ok) { const d = await r.json(); if (d && d.episodes) { if (!d.characters) d.characters = {}; if (!d.props) d.props = {}; if (!d.scenes) d.scenes = {}; Object.assign(sbData, d); } else Object.assign(sbData, emptyStoryboard()); } } catch (e) { console.error(e); }
        }
        async function loadFromServer() { await loadProjects(); if (!projects.value.length) return; const ps = window.state || {}; const init = ps.currentProject || projects.value[0]?.name; if (init) await selectProject(init); }
        async function saveIfNeeded() { if (!dirty || !projectName.value) return; saveFlowFromVueFlow(); dirty = false; try { await fetch('/api/storyboard/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: projectName.value, ...JSON.parse(JSON.stringify(sbData)) }) }); } catch (e) { console.error(e); } }
        async function syncWorkspace() {
            if (!projectName.value) { window.showToast && window.showToast('请先选择项目', 'error'); return; }
            saveFlowFromVueFlow();
            try {
                const r = await fetch('/api/storyboard/sync-folders', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: projectName.value, episodes: JSON.parse(JSON.stringify(sbData.episodes)) })
                });
                if (!r.ok) { window.showToast && window.showToast('同步失败', 'error'); return; }
                const res = await r.json();
                const created = res.created?.length || 0;
                const orphaned = res.to_delete || [];
                if (orphaned.length > 0) {
                    const list = orphaned.join('\n');
                    if (confirm(`同步完成，创建了 ${created} 个目录。\n\n发现 ${orphaned.length} 个孤立目录（项目数据中已不存在）：\n${list}\n\n是否删除这些目录？`)) {
                        const dr = await fetch('/api/storyboard/sync-folders', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ project: projectName.value, delete: orphaned })
                        });
                        if (dr.ok) {
                            const dd = await dr.json();
                            window.showToast && window.showToast(`同步完成：创建 ${created} 个，删除 ${dd.deleted?.length || 0} 个目录`, 'success');
                        }
                    } else {
                        window.showToast && window.showToast(`同步完成，创建了 ${created} 个目录（跳过删除）`, 'success');
                    }
                } else {
                    window.showToast && window.showToast(`同步完成，创建了 ${created} 个目录`, 'success');
                }
            } catch (e) { window.showToast && window.showToast('同步失败: ' + e.message, 'error'); }
        }

        function selectHistory(nodeId, path) {
            const sc = currentScene.value; if (!sc) return;
            const sh = sc.shots[nodeId]; if (!sh) return;
            const nt = sh.nodeType;
            const hist = sh.properties[nt]?.history;
            if (!hist) return;
            hist.forEach(h => h.selected = (h.path === path));
            sh.properties[nt].workspaceAsset = path;
            syncNodeToFlow(nodeId); markDirty();
        }

        function hasOutputConnection(nodeId) {
            const sc = currentScene.value;
            return sc ? sc.flow.edges.some(e => e.source === nodeId) : false;
        }

        function createFrameNode(label, assetPath, basePos, offset, sourceNodeId, frameRole) {
            const sc = currentScene.value;
            const id = uid();
            const pos = { x: basePos.x + 250, y: basePos.y + offset * 150 };
            sc.shots[id] = { ...emptyShot(id, 'image', label), sceneId: nav.sceneId, summary: label };
            sc.shots[id].properties.image.workspaceAsset = assetPath;
            const flowNode = { id, type: 'imageShot', position: pos, data: { ref: id } };
            sc.flow.nodes.push(flowNode);
            vfAddNodes([buildOneNode(sc, flowNode)]);
            const edgeId = 'e-' + sourceNodeId + '-' + id;
            const edge = {
                id: edgeId, source: sourceNodeId, target: id,
                sourceHandle: 'video-frame-out', targetHandle: 'image-in',
                animated: true,
                data: { imageRole: frameRole, sourceType: 'video' },
                style: { stroke: '#34d399', strokeWidth: 2 }
            };
            sc.flow.edges.push(edge);
            vfAddEdges([edge]);
            markDirty();
        }

        async function extractFrames(nodeId) {
            const sc = currentScene.value;
            const vfNode = sc?.flow.nodes.find(n => n.id === nodeId);
            if (!vfNode) return;
            const shot = sc.shots[vfNode.data?.ref];
            if (!shot) return;
            const asset = shot.properties.video?.workspaceAsset;
            if (!asset) { window.showToast && window.showToast('该节点没有关联的视频文件', 'error'); return; }
            const sanitize = (s, fb) => (s || fb).replace(/[\\/:*?"<>|]/g, '').trim() || fb;
            const ep = currentEpisode.value;
            const outputDir = projectName.value + '/Storyboard/' + sanitize(ep?.title, nav.episodeId) + '/' + sanitize(sc?.title, nav.sceneId);
            vfNode.data.extracting = true;
            syncNodeToFlow(nodeId);
            try {
                const resp = await fetch('/api/workspace/extract-frames', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ videoPath: asset, outputDir })
                });
                const data = await resp.json();
                if (data.error) throw new Error(data.error);
                if (!data.first && !data.last) throw new Error('未能提取到帧图片，请确认视频文件有效');
                const basePos = { ...vfNode.position };
                let idx = 0;
                if (data.first) {
                    createFrameNode('首帧', data.first.replace('/workspace/', ''), basePos, idx++, nodeId, 'firstFrame');
                }
                if (data.last) {
                    createFrameNode('尾帧', data.last.replace('/workspace/', ''), basePos, idx++, nodeId, 'lastFrame');
                }
                window.showToast && window.showToast('已导出首尾帧并创建图像节点', 'success');
            } catch (e) {
                window.showToast && window.showToast('导出帧失败: ' + e.message, 'error');
            } finally {
                vfNode.data.extracting = false;
                syncNodeToFlow(nodeId);
            }
        }

        provide(SB_ACTIONS, { drilldown: drillDown, del: deleteEntity, edit: startEdit, generate: generateFromShot, upload: uploadAsset, uploadLocal: uploadLocal, optimize: optimizePrompt, preview: openPreview, selectHistory, hasOutput: hasOutputConnection, pickLibrary: pickFromLibrary, extractFrames });

        function onNodeDragStop() { saveFlowFromVueFlow(); markDirty(); }
        function onConnect(params) {
            const sc = currentScene.value;
            const srcNode = sc ? sc.flow.nodes.find(n => n.id === params.source) : null;
            const srcShot = srcNode ? sc.shots[srcNode.data?.ref] : null;
            const srcType = srcShot?.nodeType || 'text';
            const srcHandle = params.sourceHandle;
            const tgtHandle = params.targetHandle;

            // Validate handle compatibility
            const validMap = {
                'prompt-out': ['prompt-in', 'video-prompt-in'],
                'image-out': ['image-in', 'video-image-in'],
                'video-out': ['video-video-in'],
                'video-frame-out': ['image-in'],
                'audio-out': ['video-audio-in'],
            };
            const allowed = validMap[srcHandle] || [];
            if (!allowed.includes(tgtHandle)) {
                window.showToast && window.showToast('连接不合法：此输出不能连接到该输入', 'error');
                return;
            }

            // Check connection count limits
            const existingEdges = vfGetEdges.value.filter(e => e.target === params.target && e.targetHandle === tgtHandle);
            const limits = HANDLE_LIMITS[tgtHandle];
            if (limits && limits[srcType] !== undefined && existingEdges.length >= limits[srcType]) {
                const max = limits[srcType];
                window.showToast && window.showToast(`该输入口已达上限（${max}）`, 'error');
                return;
            }

            // Image role mutual exclusion for video-image-in
            if (tgtHandle === 'video-image-in') {
                const hasRef = existingEdges.some(e => e.data?.imageRole === 'reference');
                const hasFrame = existingEdges.some(e => e.data?.imageRole === 'firstFrame' || e.data?.imageRole === 'lastFrame');
                // New edge defaults to 'reference', block if frame role exists
                if (hasFrame) {
                    window.showToast && window.showToast('已存在首/尾帧图片，不能再添加参考图（角色互斥）', 'error');
                    return;
                }
            }

            const edgeData = { imageRole: (tgtHandle === 'image-in' || tgtHandle === 'video-image-in') ? 'reference' : null, sourceType: srcType };
            const edgeStyle = { stroke: EDGE_COLORS[srcType] || '#94a3b8', strokeWidth: 2 };
            vfAddEdges([{ ...params, id: 'e-' + params.source + '-' + params.target, animated: true, data: edgeData, style: edgeStyle }]);
            saveFlowFromVueFlow(); markDirty();
        }
        function onNodeClick({ node }) { startEdit(node.id); }
        function onNodeDoubleClick({ node }) { startEdit(node.id); }
        function onEdgeClick({ edge }) { startEditEdge(edge.id); }

        function autoLayout() {
            saveFlowFromVueFlow(); const flow = currentScene.value?.flow; if (!flow) return;
            const nodes = flow.nodes, edges = flow.edges || [];
            if (!nodes.length) return;
            const nodeMap = {}; nodes.forEach(n => nodeMap[n.id] = n);
            const outEdges = {}, inAdj = {};
            nodes.forEach(n => { outEdges[n.id] = []; inAdj[n.id] = []; });
            edges.forEach(e => {
                if (nodeMap[e.source] && nodeMap[e.target]) {
                    outEdges[e.source].push(e.target); inAdj[e.target].push(e.source);
                }
            });
            // --- Identify shot groups by sink nodes (deepest output node) ---
            const handled = new Set();
            const shotGroups = [];
            // Collect sinks: nodes with no outgoing edges (deepest output)
            const sinks = nodes.filter(n => outEdges[n.id].length === 0).map(n => n.id);
            // If no sinks, treat nodes with highest depth as sinks
            const depthMap = {};
            const srcQueue = nodes.filter(n => inAdj[n.id].length === 0).map(n => n.id);
            srcQueue.forEach(id => depthMap[id] = 0);
            let qi = 0;
            while (qi < srcQueue.length) {
                const cur = srcQueue[qi++];
                for (const nxt of outEdges[cur]) {
                    const nd = depthMap[cur] + 1;
                    if ((depthMap[nxt] ?? -1) < nd) { depthMap[nxt] = nd; srcQueue.push(nxt); }
                }
            }
            nodes.forEach(n => { if (depthMap[n.id] === undefined) depthMap[n.id] = 0; });
            const sinkList = sinks.length ? sinks : nodes.filter(n => {
                const d = depthMap[n.id];
                return !outEdges[n.id].some(t => nodeMap[t] && depthMap[t] > d);
            }).map(n => n.id);
            // BFS upstream from each sink to form groups
            for (const sinkId of sinkList) {
                if (handled.has(sinkId)) continue;
                const group = [];
                const queue = [sinkId];
                while (queue.length) {
                    const cur = queue.shift();
                    if (handled.has(cur)) continue;
                    handled.add(cur); group.push(cur);
                    for (const src of inAdj[cur]) if (!handled.has(src)) queue.push(src);
                }
                shotGroups.push(group);
            }
            // Remaining isolated nodes
            for (const n of nodes) {
                if (!handled.has(n.id)) {
                    shotGroups.push([n.id]); handled.add(n.id);
                }
            }
            // --- Layout each shot group as a column in a grid ---
            const nodeW = 180, hGap = 80, vGap = 60, groupGap = 160, maxPerRow = 4;
            const positions = {};
            // For each group, compute internal depth (BFS from group-local sources)
            function computeGroupLayout(group) {
                const gSet = new Set(group);
                const gDepth = {};
                const gSources = group.filter(id => !inAdj[id].some(s => gSet.has(s)));
                if (!gSources.length) gSources.push(group[0]);
                gSources.forEach(id => gDepth[id] = 0);
                let gi = 0; const gQueue = [...gSources];
                while (gi < gQueue.length) {
                    const cur = gQueue[gi++];
                    for (const nxt of outEdges[cur]) {
                        if (gSet.has(nxt) && (gDepth[nxt] ?? -1) < gDepth[cur] + 1) {
                            gDepth[nxt] = gDepth[cur] + 1; gQueue.push(nxt);
                        }
                    }
                }
                group.forEach(id => { if (gDepth[id] === undefined) gDepth[id] = 0; });
                let maxD = 0; for (const id of group) maxD = Math.max(maxD, gDepth[id]);
                const gLayers = {};
                for (const id of group) {
                    const d = gDepth[id];
                    if (!gLayers[d]) gLayers[d] = [];
                    gLayers[d].push(id);
                }
                return { layers: gLayers, maxDepth: maxD };
            }
            const layouts = shotGroups.map(g => ({ ...computeGroupLayout(g), group: g }));
            // --- Place groups in grid (maxPerRow per row) ---
            let yBase = 50;
            for (let row = 0; row < layouts.length; row += maxPerRow) {
                const rowItems = layouts.slice(row, row + maxPerRow);
                let maxRowHeight = 0;
                let x = 50;
                for (const gl of rowItems) {
                    // Group width: depth levels arranged horizontally (left to right)
                    let groupWidth = 0;
                    for (let d = 0; d <= gl.maxDepth; d++) {
                        const cnt = (gl.layers[d] || []).length;
                        groupWidth = Math.max(groupWidth, cnt * (nodeW + hGap) - hGap);
                    }
                    groupWidth = (gl.maxDepth + 1) * (nodeW + hGap) - hGap;
                    // Place nodes: depth = horizontal position, same-depth nodes stacked vertically
                    for (let d = 0; d <= gl.maxDepth; d++) {
                        const ids = gl.layers[d] || [];
                        ids.forEach((id, i) => {
                            positions[id] = { x: x + d * (nodeW + hGap), y: yBase + i * (nodeW + vGap) };
                        });
                    }
                    let groupHeight = 1;
                    for (let d = 0; d <= gl.maxDepth; d++) {
                        groupHeight = Math.max(groupHeight, (gl.layers[d] || []).length);
                    }
                    groupHeight = groupHeight * (nodeW + vGap) - vGap;
                    maxRowHeight = Math.max(maxRowHeight, groupHeight);
                    x += groupWidth + groupGap;
                }
                yBase += maxRowHeight + groupGap;
            }
            // Apply positions
            nodes.forEach(n => { if (positions[n.id]) n.position = positions[n.id]; });
            vfSetNodes(vfGetNodes.value.map(n => ({ ...n, position: positions[n.id] || n.position })));
            markDirty();
        }

        // Clipboard for copy/paste
        const clipboard = ref([]);

        // Global settings for shot-level batch config
        const globalSettings = reactive({
            show: false,
            tab: 'image',
            imageModel: '', imageSizeTier: '', imageSize: '',
            videoModel: '', videoResolution: '', videoAspect: '',
        });
        function openGlobalSettings() {
            // Pre-fill with the first node's current values as defaults
            const sc = currentScene.value;
            const imgShot = sc ? Object.values(sc.shots).find(s => s.nodeType === 'image') : null;
            const vidShot = sc ? Object.values(sc.shots).find(s => s.nodeType === 'video') : null;
            Object.assign(globalSettings, {
                tab: imgShot ? 'image' : 'video',
                imageModel: imgShot?.properties?.image?.model || 'doubao-seedream-4-0-250828',
                imageSizeTier: imgShot?.properties?.image?.sizeTier || '2K',
                imageSize: imgShot?.properties?.image?.size || '2048x2048',
                videoModel: vidShot?.properties?.video?.model || 'doubao-seedance-2-0-260128',
                videoResolution: vidShot?.properties?.video?.resolution || '1080p',
                videoAspect: vidShot?.properties?.video?.aspect || '1:1',
            });
            globalSettings.show = true;
        }
        function closeGlobalSettings() {
            const overlay = document.querySelector('.sb-gs-overlay');
            if (overlay) {
                overlay.classList.add('closing');
                setTimeout(() => { globalSettings.show = false; }, 150);
            } else {
                globalSettings.show = false;
            }
        }
        function applyGlobalImageSettings() {
            const sc = currentScene.value; if (!sc) return;
            const gs = globalSettings;
            let count = 0;
            for (const sh of Object.values(sc.shots)) {
                if (sh.nodeType === 'image') {
                    if (gs.imageModel) sh.properties.image.model = gs.imageModel;
                    if (gs.imageSizeTier) sh.properties.image.sizeTier = gs.imageSizeTier;
                    if (gs.imageSize) sh.properties.image.size = gs.imageSize;
                    count++;
                }
            }
            markDirty();
            globalSettings.show = false;
            window.showToast && window.showToast(`已更新 ${count} 个图像节点设置`, 'success');
        }
        function applyGlobalVideoSettings() {
            const sc = currentScene.value; if (!sc) return;
            const gs = globalSettings;
            let count = 0;
            for (const sh of Object.values(sc.shots)) {
                if (sh.nodeType === 'video') {
                    if (gs.videoModel) sh.properties.video.model = gs.videoModel;
                    if (gs.videoResolution) sh.properties.video.resolution = gs.videoResolution;
                    if (gs.videoAspect) sh.properties.video.aspect = gs.videoAspect;
                    count++;
                }
            }
            markDirty();
            globalSettings.show = false;
            window.showToast && window.showToast(`已更新 ${count} 个视频节点设置`, 'success');
        }

        function onKeyUp(e) {
        }

        function onKeyDown(e) {
            // Don't handle keys when typing in input/textarea
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (nav.level !== 'shot') return;

            // Ctrl+C: copy selected nodes
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const selected = vfGetSelectedNodes.value;
                if (!selected.length) return;
                const sc = currentScene.value; if (!sc) return;
                clipboard.value = selected.map(n => {
                    const sh = sc.shots[n.data?.ref];
                    if (!sh) return null;
                    return { shot: JSON.parse(JSON.stringify(sh)), position: { ...n.position } };
                }).filter(Boolean);
                e.preventDefault();
                if (clipboard.value.length) window.showToast && window.showToast(`已复制 ${clipboard.value.length} 个节点`, 'info');
                return;
            }

            // Ctrl+V: paste copied nodes
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                if (!clipboard.value.length) return;
                const sc = currentScene.value; if (!sc) return;
                const newNodes = [];
                const offset = 80;
                for (const item of clipboard.value) {
                    const newId = uid();
                    const newShot = { ...emptyShot(newId, item.shot.nodeType, item.shot.title), sceneId: nav.sceneId };
                    // Deep copy properties from clipboard
                    newShot.properties = JSON.parse(JSON.stringify(item.shot.properties));
                    // Clear generation state
                    const nt = newShot.nodeType;
                    if (nt === 'image') { newShot.properties.image.history = []; newShot.properties.image.workspaceAsset = null; }
                    if (nt === 'video') { newShot.properties.video.history = []; newShot.properties.video.workspaceAsset = null; }
                    if (nt === 'audio') { newShot.properties.audio.workspaceAsset = null; }
                    if (nt === 'text') { newShot.properties.text.workspaceAsset = null; }
                    newShot.summary = item.shot.summary || '';
                    newShot.notes = item.shot.notes || '';
                    sc.shots[newId] = newShot;
                    const pos = { x: item.position.x + offset, y: item.position.y + offset };
                    sc.flow.nodes.push({ id: newId, type: nt + 'Shot', position: pos, data: { ref: newId } });
                    newNodes.push({ id: newId, type: nt + 'Shot', position: pos, data: buildOneNode(sc, sc.flow.nodes[sc.flow.nodes.length - 1]).data });
                }
                vfAddNodes(newNodes);
                markDirty();
                e.preventDefault();
                window.showToast && window.showToast(`已粘贴 ${newNodes.length} 个节点`, 'success');
                return;
            }

            // Delete/Backspace: delete selected nodes or edge
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const selected = vfGetSelectedNodes.value;
                if (selected.length > 0) {
                    // Batch delete selected nodes
                    e.preventDefault();
                    saveFlowFromVueFlow();
                    const sc = currentScene.value; if (!sc) return;
                    const ids = selected.map(n => n.id);
                    for (const nodeId of ids) {
                        delete sc.shots[nodeId];
                        sc.flow.nodes = sc.flow.nodes.filter(n => n.id !== nodeId);
                        sc.flow.edges = sc.flow.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
                        if (editTarget.value?.id === nodeId) editTarget.value = null;
                    }
                    vfRemoveNodes(ids);
                    markDirty();
                    window.showToast && window.showToast(`已删除 ${ids.length} 个节点`, 'info');
                    return;
                }
                if (editTarget.value?.type === 'edge') {
                    const edgeId = editTarget.value.id;
                    editTarget.value = null;
                    vfRemoveEdges([edgeId]);
                    saveFlowFromVueFlow(); markDirty();
                }
                return;
            }
        }

        // --- Library (characters & props) ---
        const libraryState = reactive({ show: false, tab: 'character', editId: null, generating: false, batchMode: false, selectedIds: {}, styleIndex: 0, styleCustom: '' });
        function openLibrary() { libraryState.show = true; libraryState.editId = null; }
        function closeLibrary() { libraryState.show = false; libraryState.editId = null; }
        const _libFolder = { character: '角色库', prop: '道具库', scene: '场景库' };
        const _libPrefix = { character: 'char_', prop: 'prop_', scene: 'scene_' };
        function getLibStore(type) { return type === 'character' ? sbData.characters : type === 'prop' ? sbData.props : sbData.scenes; }
        function addLibraryItem(type) {
            const id = uid();
            const item = { id, name: '', description: '', tags: [], imageAsset: null, imagePrompt: '' };
            if (type === 'prop' || type === 'scene') item.category = '';
            getLibStore(type)[id] = item;
            libraryState.editId = id;
            markDirty();
        }
        function deleteLibraryItem(type, id) {
            delete getLibStore(type)[id];
            if (libraryState.editId === id) libraryState.editId = null;
            delete libraryState.selectedIds[id];
            markDirty();
        }
        function toggleBatchMode() {
            libraryState.batchMode = !libraryState.batchMode;
            libraryState.selectedIds = {};
        }
        function toggleSelectLibItem(id) {
            if (libraryState.selectedIds[id]) delete libraryState.selectedIds[id];
            else libraryState.selectedIds[id] = true;
        }
        function batchDeleteLibItems() {
            const store = getLibStore(libraryState.tab);
            const ids = Object.keys(libraryState.selectedIds);
            if (!ids.length) return;
            const count = ids.filter(id => store[id]).length;
            if (!confirm(`确认删除 ${count} 项？`)) return;
            ids.forEach(id => { delete store[id]; });
            libraryState.selectedIds = {};
            libraryState.batchMode = false;
            if (libraryState.editId && !store[libraryState.editId]) libraryState.editId = null;
            markDirty();
        }
        function getLibraryEditItem() {
            if (!libraryState.editId) return null;
            return sbData.characters[libraryState.editId] || sbData.props[libraryState.editId] || sbData.scenes[libraryState.editId] || null;
        }
        function onLibField(field, e) {
            const item = getLibraryEditItem(); if (!item) return;
            item[field] = e.target.value; markDirty();
        }
        function onLibTags(e) {
            const item = getLibraryEditItem(); if (!item) return;
            item.tags = e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean); markDirty();
        }
        async function uploadLibImage(type, id) {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = async () => {
                const file = input.files[0]; if (!file) return;
                const folder = (projectName.value || '') + '/' + (_libFolder[type] || '场景库');
                const formData = new FormData();
                formData.append('file', file);
                formData.append('project', projectName.value || '');
                formData.append('subdir', folder);
                try {
                    const resp = await fetch('/api/workspace/upload', { method: 'POST', body: formData });
                    if (resp.ok) {
                        const result = await resp.json();
                        const relPath = (result.serveUrl || '').replace(/^\/workspace\//, '') || (folder + '/' + file.name);
                        const store = getLibStore(type);
                        if (store[id]) { store[id].imageAsset = relPath; markDirty(); }
                        window.showToast && window.showToast('上传成功', 'success');
                    } else {
                        window.showToast && window.showToast('上传失败', 'error');
                    }
                } catch (e) { window.showToast && window.showToast('上传失败', 'error'); }
            };
            input.click();
        }
        function getStylePrompt(state) {
            const preset = STYLE_PRESETS[state.styleIndex || 0];
            return preset && preset.prompt ? preset.prompt : (state.styleCustom || '高端动画艺术册风格，简约、电影感、高端干净');
        }
        function buildCharPrompt(name, desc, style) {
            return `创建16:9艺术化角色身份板，纯白/柔和米白背景，无环境、道具、标识、水印。整体为${style}。不对称优雅布局，大面积留白，拒绝网格、目录、蓝图样式。所有角色图像不重叠、画面分离且留白充足，完整展示人物，不裁切面部、不隐藏肢体。画面偏中心放置大尺寸角色全身主视觉，周边排布中性全身、背面、侧面、坐姿、倾斜姿势、蹲姿、俯视、仰视视角及表情肖像，所有画面为独立角色研究图。全图角色形象统一，面部、发型、服装、身形、姿态保持一致，五官、轮廓、服饰、手部、表情细节清晰。设置表情研究区、服饰面部细节研究区。添加简约艺术风角色信息栏:名称、角色定位、核心情绪、视觉标志，可搭配少量手写标签与简易标注。角色：${name}，${desc}`;
        }
        function buildPropPrompt(name, desc, style) {
            return `创建16:9艺术化道具/物品参考板，纯白/柔和米白背景，无环境、人物、标识、水印。整体为${style}。不对称优雅布局，大面积留白，拒绝网格、目录、蓝图样式。所有物品图像不重叠、画面分离且留白充足，完整展示物品，不裁切、不隐藏细节。画面偏中心放置大尺寸物品主视觉，周边排布正面、侧面、背面、俯视、仰视、细节特写(材质、纹理、接缝、装饰)视图，所有画面为独立物品研究图。全图物品形象统一，形状、材质、颜色、尺寸、细节保持一致。设置结构分解研究区、材质纹理特写区、尺寸比例参考区。添加简约艺术风物品信息栏:名称、类型、材质、用途，可搭配少量手写标签与简易标注。道具：${name}，${desc}`;
        }
        function buildScenePrompt(name, desc, style) {
            return `创建16:9艺术化场景/环境参考板，无人物、标识、水印。整体为${style}。不对称优雅布局，大面积留白，拒绝网格、蓝图样式。所有场景图像不重叠、画面分离且留白充足。画面偏中心放置大尺寸场景主视觉（广角全景），周边排布远景、中景、近景、俯视、仰视、鸟瞰视角及局部细节特写（材质、纹理、光影、氛围），所有画面为独立场景研究图。全图场景氛围统一，色调、光影、建筑风格、自然环境保持一致。设置氛围光影研究区、材质纹理特写区、空间比例参考区。添加简约艺术风场景信息栏:名称、类型、时间段、氛围，可搭配少量手写标签与简易标注。场景：${name}，${desc}`;
        }
        async function generateLibImage(type, id) {
            const apiKey = window.state?.arkApiKey; if (!apiKey) { window.showToast && window.showToast('请先配置 API Key', 'error'); return; }
            const store = getLibStore(type);
            const item = store[id]; if (!item || !item.description) { window.showToast && window.showToast('请先填写描述', 'error'); return; }
            libraryState.generating = true;
            try {
                const style = getStylePrompt(libraryState);
                const prompt = type === 'character'
                    ? buildCharPrompt(item.name, item.description, style)
                    : type === 'prop'
                    ? buildPropPrompt(item.name, item.description, style)
                    : buildScenePrompt(item.name, item.description, style);
                const folder = (projectName.value || '') + '/' + (_libFolder[type] || '场景库');
                await ensureDir(folder);
                const body = { model: 'doubao-seedream-4-0-250828', prompt, size: '2048x2048', response_format: 'url', sequential_image_generation: 'disabled' };
                const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                    body: JSON.stringify(body)
                });
                if (!r.ok) throw new Error('API错误');
                const data = await r.json();
                if (data.error) throw new Error(data.error.message || 'API错误');
                const imgUrl = data.data?.[0]?.url; if (!imgUrl) throw new Error('无图像URL');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = (_libPrefix[type] || 'scene_') + ts + '.png';
                const saveR = await fetch('/api/workspace/save', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: imgUrl, filename, subdir: folder })
                });
                if (saveR.ok) { const sd = await saveR.json(); item.imageAsset = sd.path || (folder + '/' + filename); item.imagePrompt = prompt; }
                else { item.imageAsset = folder + '/' + filename; item.imagePrompt = prompt; }
                markDirty();
                window.showToast && window.showToast('生成成功', 'success');
            } catch (e) {
                console.error('Lib image gen error:', e);
                window.showToast && window.showToast('生成失败: ' + e.message, 'error');
            } finally { libraryState.generating = false; }
        }

        // --- @mention for shot prompts ---
        const mentionState = reactive({ show: false, nodeId: null, refs: [] });

        function getConnectedRefs(nodeId) {
            const sc = currentScene.value;
            if (!sc) return [];
            const refs = [];
            for (const edge of sc.flow.edges) {
                if (edge.target !== nodeId) continue;
                if (edge.targetHandle === 'prompt-in' || edge.targetHandle === 'video-prompt-in') continue;
                const srcNode = sc.flow.nodes.find(n => n.id === edge.source);
                if (!srcNode) continue;
                const srcShot = sc.shots[srcNode.data?.ref];
                if (!srcShot) continue;
                const nt = srcShot.nodeType;
                const asset = srcShot.properties[nt]?.workspaceAsset;
                if (!asset) continue;
                const role = edge.data?.imageRole || 'reference';
                refs.push({ edgeId: edge.id, type: nt, name: srcShot.title || nt, path: asset, role });
            }
            return refs;
        }

        function getCombinedPrompt(nodeId) {
            const sc = currentScene.value; if (!sc) return '';
            const sh = sc.shots[nodeId]; if (!sh) return '';
            const nt = sh.nodeType;
            const prompt = nt === 'image' ? sh.properties.image?.prompt : nt === 'video' ? sh.properties.video?.prompt : '';
            const extPrompt = getConnectedPrompt(nodeId);
            const base = prompt || extPrompt;
            if (!base) return '';
            const refs = getConnectedRefs(nodeId);
            if (!refs.length) return base;
            const roleLabels = { reference: '参考图', firstFrame: '首帧', lastFrame: '尾帧' };
            const typeLabels = { image: '图片', video: '视频', audio: '音频' };
            const descs = refs.map((ref, i) => {
                const tl = typeLabels[ref.type] || ref.type;
                const rl = ref.type === 'image' ? (roleLabels[ref.role] || '参考图') : (ref.type === 'video' ? '参考视频' : '参考音频');
                return `${tl}${i + 1}为${ref.name}（${rl}）`;
            });
            return base + '\n\n参考素材说明：' + descs.join('，') + '。';
        }

        function showMentionPopup(nodeId) {
            const refs = getConnectedRefs(nodeId);
            if (!refs.length) return;
            mentionState.nodeId = nodeId;
            mentionState.refs = refs;
            mentionState.show = true;
        }

        function hideMentionPopup() { mentionState.show = false; }

        function insertMentionRef(ref) {
            const typeLabels = { image: '图片', video: '视频', audio: '音频' };
            const label = typeLabels[ref.type] || ref.type;
            const sameType = mentionState.refs.filter(r => r.type === ref.type);
            const idx = sameType.indexOf(ref) + 1;
            const tag = `@${label}${idx}`;
            const sc = currentScene.value;
            const shot = sc?.shots[mentionState.nodeId];
            if (!shot) return;
            const prop = shot.properties[shot.nodeType];
            prop.prompt = ((prop.prompt || '') + ' ' + tag).trim();
            markDirty();
            hideMentionPopup();
        }

        // --- Script Import (progressive: episodes → scenes → shots) ---
        const scriptState = reactive({
            show: false, level: 'episodes', step: 'idle',
            scriptText: '', filename: '', model: '',
            progress: '', error: '', source: '',
            result: null,
            selectedChars: {}, selectedProps: {}, selectedScenes: {}, generatingImages: false,
            detailId: null, // 'ep-N' | 'ch-N' | 'pr-N' | 'scn-N' for detail view
            styleIndex: 0, styleCustom: '',
        });
        const textModels = window.state?.textModels ? Object.values(window.state.textModels) : ['doubao-seed-2-0-pro-260215'];
        function friendlyModelName(id) {
            if (!id) return '';
            // doubao-seed-x-y-suffix-date → Doubao Seed X.Y Suffix
            const m = id.match(/^doubao-seed-(\d+)-(\d+)(?:-(pro|lite|fast))?(?:-\d+)?$/i);
            if (m) {
                let name = `Doubao Seed ${m[1]}.${m[2]}`;
                if (m[3]) name += ' ' + m[3].charAt(0).toUpperCase() + m[3].slice(1);
                return name;
            }
            return id;
        }

        function openScriptImport(level) {
            // level: 'episodes' | 'scenes' | 'shots'
            let preText = '';
            if (level === 'scenes') { preText = currentEpisode.value?.scriptText || ''; }
            if (level === 'shots') { preText = currentScene.value?.scriptText || ''; }
            Object.assign(scriptState, { show: true, level, step: 'idle', scriptText: preText, filename: '', error: '', progress: '', source: '', result: null, selectedChars: {}, selectedProps: {}, selectedScenes: {}, generatingImages: false, model: textModels[0] || '' });
        }
        function closeScriptImport() { scriptState.show = false; }

        // --- Interactive Script Writing (交互式剧本创作) ---
        const screenwriterState = reactive({
            show: false, step: 'chat',  // 'chat' | 'preview'
            messages: [], input: '', loading: false,
            ready: false,        // LLM 已输出 [READY_TO_WRITE]
            generating: false,   // 生成剧本调用进行中
            screenplay: '', model: '', error: '',
        });
        const SW_CHAT_SYSTEM = `你是 InspoVanna StoryBoard 的资深编剧助手，专门帮助用户从一个模糊的故事点子出发，逐步打磨成一个结构完整、可拍摄的故事。

你的工作方式：
1. 用户会先描述一个初步的故事想法。你要像专业编剧一样，通过提问把故事逐步具体化。
2. 每轮只问 1-2 个最关键的问题，不要一次抛出一长串问题，保持对话自然、循序渐进。
3. 你需要逐步澄清并确认以下要素（不必严格按顺序，缺什么补什么）：
   - 题材/类型（如：科幻、悬疑、爱情、奇幻、现实主义…）
   - 主角（身份、性格、目标、动机）
   - 重要配角与人物关系
   - 背景设定（时代、地点、世界观）
   - 核心冲突（主角面对的核心障碍或矛盾）
   - 情节走向（开端、发展、高潮的大致脉络）
   - 结局（基调与走向）
   - 风格基调（如：轻松幽默、黑暗沉重、热血、温情…）
4. 在提问的同时，适当复述并总结你已经掌握的设定，帮助用户确认。
5. 当你判断以上要素已经足够清晰、足以写出一个完整故事时，在你这一轮回复的【最后单独一行】输出标记：
[READY_TO_WRITE]
   —— 这个标记是给程序读取的信号，表示"可以开始写剧本了"。即使输出了这个标记，你仍要正常地继续对话、邀请用户补充或直接生成剧本，不要停止交流。
6. 不要在信息明显不足时过早输出该标记。一旦输出过一次，只要后续信息仍然充分，可在后续回复中继续输出。

请用中文、简洁专业地交流。`;
        const SW_WRITE_SYSTEM = `你是一名专业编剧。下面是用户与编剧助手之间关于一个故事的完整讨论。请你基于这段讨论中确定的所有设定，将其改写成一部结构规范、可用于后续拆分剧集/场景的中文剧本。

输出要求（严格遵守）：
1. 直接输出剧本正文，不要任何解释、前言、客套话或 Markdown 代码块包裹。
2. 用清晰的场景结构组织全文。每个场景以场景标题行开头，格式为：
   场景N　[内/外景]　地点　—　时间（日/夜）
   例如：场景1　内景　咖啡馆　—　日
3. 每个场景标题之后，先写一段【场景描述】，交代环境、氛围与正在发生的动作。
4. 人物登场时用全名，对白格式为：
   人物名：（可选的表演提示）对白内容
5. 重要的动作、转场、情绪变化用单独的动作行描述。
6. 按故事的开端、发展、高潮、结局合理划分为多个场景，使剧情完整、节奏清楚。
7. 全文使用中文，保持专业剧本的书面语风格。

请直接开始输出剧本。`;
        function openScreenwriter() {
            Object.assign(screenwriterState, {
                show: true, step: 'chat', messages: [], input: '',
                loading: false, ready: false, generating: false,
                screenplay: '', error: '', model: textModels[0] || '',
            });
        }
        function closeScreenwriter() { screenwriterState.show = false; }
        async function sendScreenwriterMessage() {
            const msg = screenwriterState.input.trim();
            if (!msg || screenwriterState.loading) return;
            screenwriterState.messages.push({ role: 'user', content: msg });
            screenwriterState.input = '';
            screenwriterState.loading = true;
            try {
                const apiKey = window.state?.arkApiKey;
                if (!apiKey) throw new Error('请先在设置中配置 API Key');
                const model = screenwriterState.model || textModels[0] || 'doubao-seed-2-0-pro-260215';
                const apiMessages = [{ role: 'system', content: SW_CHAT_SYSTEM }, ...screenwriterState.messages.slice(-30)];
                const r = await fetch('/api/ark/chat', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: apiMessages })
                });
                const data = await r.json();
                if (data.error) throw new Error(data.error);
                let reply = data.choices?.[0]?.message?.content || data.output?.[0]?.content?.[0]?.text || '（无回复）';
                if (reply.includes('[READY_TO_WRITE]')) {
                    screenwriterState.ready = true;
                    reply = reply.split('\n').filter(l => l.trim() !== '[READY_TO_WRITE]').join('\n');
                    reply = reply.replace(/\[READY_TO_WRITE\]/g, '').trim();
                }
                screenwriterState.messages.push({ role: 'assistant', content: reply || '（无回复）' });
            } catch (e) {
                screenwriterState.messages.push({ role: 'assistant', content: '❌ ' + e.message });
            } finally { screenwriterState.loading = false; }
        }
        async function generateScreenplay() {
            if (screenwriterState.generating) return;
            if (!screenwriterState.messages.some(m => m.role === 'user')) {
                screenwriterState.error = '请先与编剧助手讨论你的故事'; return;
            }
            screenwriterState.generating = true;
            screenwriterState.error = '';
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000);
            try {
                const apiKey = window.state?.arkApiKey;
                if (!apiKey) throw new Error('请先在设置中配置 API Key');
                const model = screenwriterState.model || textModels[0] || 'doubao-seed-2-0-pro-260215';
                const transcript = screenwriterState.messages
                    .map(m => (m.role === 'user' ? '用户' : '编剧助手') + '：' + m.content)
                    .join('\n\n');
                const apiMessages = [
                    { role: 'system', content: SW_WRITE_SYSTEM },
                    { role: 'user', content: '以下是完整讨论：\n\n' + transcript + '\n\n请基于以上讨论输出完整剧本。' },
                ];
                const r = await fetch('/api/ark/chat', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model, messages: apiMessages }), signal: controller.signal
                });
                const data = await r.json();
                if (data.error) throw new Error(data.error);
                const sp = data.choices?.[0]?.message?.content || data.output?.[0]?.content?.[0]?.text || '';
                if (!sp.trim()) throw new Error('生成结果为空，请重试');
                screenwriterState.screenplay = sp.trim();
                screenwriterState.step = 'preview';
            } catch (e) {
                screenwriterState.error = e.name === 'AbortError' ? '❌ 生成超时（5分钟），请重试' : '❌ ' + e.message;
            } finally { clearTimeout(timeoutId); screenwriterState.generating = false; }
        }
        function useScreenplayForImport() {
            const text = (screenwriterState.screenplay || '').trim();
            if (!text) return;
            if (!confirm('将生成的剧本载入"剧本导入"进行拆分？')) return;
            closeScreenwriter();
            openScriptImport('episodes');
            scriptState.scriptText = text;
        }
        async function saveScreenplayToWorkspace() {
            const text = (screenwriterState.screenplay || '').trim();
            if (!text) return;
            if (!projectName.value) { window.showToast && window.showToast('请先选择项目', 'error'); return; }
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = '剧本_' + ts + '.txt';
            const subdir = projectName.value + '/Text';
            try {
                await ensureDir(subdir);
                const r = await fetch('/api/workspace/save-text', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: text, filename, subdir })
                });
                if (!r.ok) throw new Error('保存失败');
                window.showToast && window.showToast('已保存到 ' + subdir + '/' + filename, 'success');
            } catch (e) {
                window.showToast && window.showToast('保存失败: ' + e.message, 'error');
            }
        }

        async function startScriptAnalysis() {
            const text = scriptState.scriptText.trim();
            if (!text) { scriptState.error = '请输入或上传剧本内容'; return; }
            scriptState.step = 'analyzing'; scriptState.progress = '正在连接 AI 服务...'; scriptState.error = '';
            // Progress simulation
            const progressHints = ['正在发送剧本至 AI...', 'AI 正在分析剧本结构...', 'AI 正在生成分析结果（可能需要1-3分钟）...', '仍在等待 AI 响应，请耐心等待...'];
            let hintIdx = 0;
            const progressTimer = setInterval(() => {
                if (hintIdx < progressHints.length) { scriptState.progress = progressHints[hintIdx++]; }
            }, 15000);
            // 5 minute timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000);
            try {
                const r = await fetch('/api/script/analyze', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ script_text: text, mode: scriptState.level, model: scriptState.model }),
                    signal: controller.signal
                });
                const data = await r.json();
                if (!r.ok || data.error) throw new Error(data.error || '分析失败');
                scriptState.source = data.source || 'llm';
                scriptState.result = data.result;
                if (scriptState.level === 'episodes') {
                    const selC = {}, selP = {}, selS = {};
                    (data.result.characters || []).forEach((_, i) => selC[i] = true);
                    (data.result.props || []).forEach((_, i) => selP[i] = true);
                    (data.result.scenes || []).forEach((_, i) => selS[i] = true);
                    scriptState.selectedChars = selC; scriptState.selectedProps = selP; scriptState.selectedScenes = selS;
                }
                scriptState.step = 'preview';
            } catch (e) {
                if (e.name === 'AbortError') { scriptState.error = '分析超时（5分钟），请缩短剧本后重试'; }
                else { scriptState.error = e.message; }
                scriptState.step = 'idle';
            } finally { clearInterval(progressTimer); clearTimeout(timeoutId); }
        }

        async function generateSelectedImages() {
            const chars = (scriptState.result?.characters || []).filter((_, i) => scriptState.selectedChars[i]);
            const props = (scriptState.result?.props || []).filter((_, i) => scriptState.selectedProps[i]);
            const scns = (scriptState.result?.scenes || []).filter((_, i) => scriptState.selectedScenes[i]);
            chars.forEach(c => c._type = 'character');
            props.forEach(p => p._type = 'prop');
            scns.forEach(s => s._type = 'scene');
            const all = [...chars, ...props, ...scns];
            if (!all.length) { window.showToast && window.showToast('请至少选择一项', 'error'); return; }
            const apiKey = window.state?.arkApiKey;
            if (!apiKey) { window.showToast && window.showToast('请先配置 API Key', 'error'); return; }
            scriptState.generatingImages = true;
            let done = 0, failed = 0;
            try {
                for (const item of all) {
                    scriptState.progress = `生成图片 ${done + failed + 1}/${all.length}: ${item.name}`;
                    try {
                        const style = getStylePrompt(scriptState);
                        const prompt = item._type === 'character'
                            ? buildCharPrompt(item.name, item.description, style)
                            : item._type === 'prop'
                            ? buildPropPrompt(item.name, item.description, style)
                            : buildScenePrompt(item.name, item.description, style);
                        const folder = (projectName.value || '') + '/' + (_libFolder[item._type] || '场景库');
                        await ensureDir(folder);
                        const body = { model: 'doubao-seedream-4-0-250828', prompt, size: '2048x2048', response_format: 'url', sequential_image_generation: 'disabled' };
                        const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
                            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                            body: JSON.stringify(body)
                        });
                        if (!r.ok) throw new Error('API错误');
                        const imgData = await r.json();
                        if (imgData.error) throw new Error(imgData.error.message);
                        const imgUrl = imgData.data?.[0]?.url; if (!imgUrl) throw new Error('无图像URL');
                        const ts = new Date().toISOString().replace(/[:.]/g, '-') + done;
                        const filename = (_libPrefix[item._type] || 'scene_') + ts + '.png';
                        const saveR = await fetch('/api/workspace/save', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: imgUrl, filename, subdir: folder })
                        });
                        if (saveR.ok) { const sd = await saveR.json(); item._imageAsset = sd.path || (folder + '/' + filename); }
                        else { item._imageAsset = folder + '/' + filename; }
                        item._imagePrompt = prompt;
                        // Also write directly to library so assets are available even if dialog was closed
                        const id = uid();
                        const storeMap = { character: sbData.characters, prop: sbData.props, scene: sbData.scenes };
                        const store = storeMap[item._type];
                        if (store) {
                            const existing = Object.values(store).find(x => x.name === item.name);
                            if (existing) {
                                existing.imageAsset = item._imageAsset;
                                existing.imagePrompt = prompt;
                            } else {
                                store[id] = { id, name: item.name, description: item.description || '', tags: item.tags || [], imageAsset: item._imageAsset, imagePrompt: prompt, ...(item._type === 'prop' || item._type === 'scene' ? { category: item.category || '' } : {}) };
                            }
                            markDirty();
                        }
                        done++;
                    } catch (e) { console.error('Gen image for', item.name, e); failed++; }
                }
                scriptState.progress = `已生成 ${done} 张图片` + (failed ? `，${failed} 张失败` : '');
                window.showToast && window.showToast(`已生成 ${done} 张参考图` + (failed ? `，${failed} 张失败` : ''), failed ? 'warning' : 'success');
            } finally { scriptState.generatingImages = false; }
        }

        function confirmImport() {
            const result = scriptState.result;
            if (!result) return;
            if (scriptState.level === 'episodes') importEpisodes(result);
            else if (scriptState.level === 'scenes') importScenes(result);
            else if (scriptState.level === 'shots') importShots(result);
        }

        function importEpisodes(result) {
            saveFlowFromVueFlow();
            // Check for duplicates and confirm overwrite
            const dupChars = [], dupProps = [], dupScenes = [];
            (result.characters || []).forEach((c, i) => {
                if (scriptState.selectedChars[i]) {
                    const existing = Object.values(sbData.characters || {}).find(x => x.name === c.name);
                    if (existing) dupChars.push({ name: c.name, existingId: existing.id, index: i });
                }
            });
            (result.props || []).forEach((p, i) => {
                if (scriptState.selectedProps[i]) {
                    const existing = Object.values(sbData.props || {}).find(x => x.name === p.name);
                    if (existing) dupProps.push({ name: p.name, existingId: existing.id, index: i });
                }
            });
            (result.scenes || []).forEach((s, i) => {
                if (scriptState.selectedScenes[i]) {
                    const existing = Object.values(sbData.scenes || {}).find(x => x.name === s.name);
                    if (existing) dupScenes.push({ name: s.name, existingId: existing.id, index: i });
                }
            });
            if (dupChars.length || dupProps.length || dupScenes.length) {
                const names = [...dupChars.map(d => '角色: ' + d.name), ...dupProps.map(d => '道具: ' + d.name), ...dupScenes.map(d => '场景: ' + d.name)].join('\n');
                if (!confirm(`以下素材已存在素材库中：\n${names}\n\n确认后将覆盖已有条目，是否继续？`)) return;
                dupChars.forEach(d => delete sbData.characters[d.existingId]);
                dupProps.forEach(d => delete sbData.props[d.existingId]);
                dupScenes.forEach(d => delete sbData.scenes[d.existingId]);
            }
            // Import characters/props/scenes to library
            const charImageMap = {}, propImageMap = {};
            (result.characters || []).forEach((c, i) => {
                if (scriptState.selectedChars[i]) {
                    const id = uid();
                    sbData.characters[id] = { id, name: c.name, description: c.description || '', tags: c.tags || [], imageAsset: c._imageAsset || null, imagePrompt: c._imagePrompt || '' };
                    if (c._imageAsset) charImageMap[c.name] = c._imageAsset;
                }
            });
            (result.props || []).forEach((p, i) => {
                if (scriptState.selectedProps[i]) {
                    const id = uid();
                    sbData.props[id] = { id, name: p.name, description: p.description || '', category: p.category || '', tags: p.tags || [], imageAsset: p._imageAsset || null, imagePrompt: p._imagePrompt || '' };
                    if (p._imageAsset) propImageMap[p.name] = p._imageAsset;
                }
            });
            (result.scenes || []).forEach((s, i) => {
                if (scriptState.selectedScenes[i]) {
                    const id = uid();
                    sbData.scenes[id] = { id, name: s.name, description: s.description || '', category: s.category || '', tags: s.tags || [], imageAsset: s._imageAsset || null, imagePrompt: s._imagePrompt || '' };
                }
            });
            // Import episodes (with scriptText for scene-level splitting later)
            for (const ep of (result.episodes || [])) {
                const epId = uid();
                sbData.episodes[epId] = { ...emptyEntity(epId), scriptText: ep.text || '', title: ep.title || '', summary: ep.summary || '', tags: ep.tags || [], scenes: {}, flow: { nodes: [], edges: [] } };
            }
            markDirty(); navigate('episode');
            scriptState.show = false;
            window.showToast && window.showToast(`已导入 ${(result.episodes || []).length} 个剧集`, 'success');
        }

        function importScenes(result) {
            saveFlowFromVueFlow();
            const ep = currentEpisode.value; if (!ep) return;
            for (const sc of (result.scenes || [])) {
                const scId = uid();
                ep.scenes[scId] = { ...emptyEntity(scId), scriptText: sc.text || '', episodeId: nav.episodeId, title: sc.title || '', summary: sc.summary || '', tags: sc.tags || [], shots: {}, flow: { nodes: [], edges: [] } };
            }
            markDirty(); syncFlowToVueFlow();
            scriptState.show = false;
            window.showToast && window.showToast(`已导入 ${(result.scenes || []).length} 个场景`, 'success');
        }

        function importShots(result) {
            const sc = currentScene.value; if (!sc) return;
            // Build image maps from library
            const charImageMap = {};
            Object.values(sbData.characters || {}).forEach(c => { if (c.imageAsset) charImageMap[c.name] = c.imageAsset; });
            const propImageMap = {};
            Object.values(sbData.props || {}).forEach(p => { if (p.imageAsset) propImageMap[p.name] = p.imageAsset; });
            const sceneImageMap = {};
            Object.values(sbData.scenes || {}).forEach(s => { if (s.imageAsset) sceneImageMap[s.name] = s.imageAsset; });
            // Flexible name matching: try exact match first, then substring match
            function findAsset(name, map) {
                if (map[name]) return map[name];
                for (const key of Object.keys(map)) {
                    if (key.includes(name) || name.includes(key)) return map[key];
                }
                return null;
            }
            function resolveRefs(names, map) {
                return names.map(n => ({ name: n, asset: findAsset(n, map) })).filter(r => r.asset);
            }
            let xOff = 50;
            for (const shot of (result.shots || [])) {
                const refChars = resolveRefs(shot.characters || [], charImageMap);
                const refProps = resolveRefs(shot.props || [], propImageMap);
                const refScenes = resolveRefs(shot.scenes || [], sceneImageMap);
                const imageNodes = [];
                for (const r of refChars) {
                    const imgId = uid();
                    sc.shots[imgId] = { ...emptyShot(imgId, 'image', r.name), sceneId: nav.sceneId, summary: r.name + ' 参考图' };
                    sc.shots[imgId].properties.image.workspaceAsset = r.asset;
                    sc.flow.nodes.push({ id: imgId, type: 'imageShot', position: { x: xOff, y: 50 }, data: { ref: imgId } });
                    imageNodes.push(imgId); xOff += 280;
                }
                for (const r of refProps) {
                    const imgId = uid();
                    sc.shots[imgId] = { ...emptyShot(imgId, 'image', r.name), sceneId: nav.sceneId, summary: r.name + ' 参考图' };
                    sc.shots[imgId].properties.image.workspaceAsset = r.asset;
                    sc.flow.nodes.push({ id: imgId, type: 'imageShot', position: { x: xOff, y: 50 }, data: { ref: imgId } });
                    imageNodes.push(imgId); xOff += 280;
                }
                for (const r of refScenes) {
                    const imgId = uid();
                    sc.shots[imgId] = { ...emptyShot(imgId, 'image', r.name), sceneId: nav.sceneId, summary: r.name + ' 参考图' };
                    sc.shots[imgId].properties.image.workspaceAsset = r.asset;
                    sc.flow.nodes.push({ id: imgId, type: 'imageShot', position: { x: xOff, y: 50 }, data: { ref: imgId } });
                    imageNodes.push(imgId); xOff += 280;
                }
                const vidId = uid();
                sc.shots[vidId] = { ...emptyShot(vidId, 'video', shot.title || '镜头'), sceneId: nav.sceneId, summary: shot.summary || '' };
                sc.shots[vidId].properties.video.prompt = shot.prompt || '';
                if (shot.duration) sc.shots[vidId].properties.video.duration = shot.duration;
                sc.flow.nodes.push({ id: vidId, type: 'videoShot', position: { x: xOff, y: 50 }, data: { ref: vidId } });
                for (const srcId of imageNodes) {
                    sc.flow.edges.push({ id: uid(), source: srcId, target: vidId, sourceHandle: 'image-out', targetHandle: 'video-image-in', data: { sourceType: 'image', imageRole: 'reference' } });
                }
                xOff += 350;
            }
            syncFlowToVueFlow(); markDirty();
            scriptState.show = false;
            window.showToast && window.showToast(`已导入 ${(result.shots || []).length} 个镜头`, 'success');
        }

        function onScriptFileInput() {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.txt,.md,.text';
            input.onchange = () => {
                const file = input.files?.[0]; if (!file) return;
                scriptState.filename = file.name;
                const reader = new FileReader();
                reader.onload = () => { scriptState.scriptText = reader.result; };
                reader.readAsText(file);
            };
            input.click();
        }
        async function onScriptWorkspacePick() {
            const path = prompt('输入工作空间中剧本文件的路径（如: 剧本/第一集.txt）:');
            if (!path) return;
            try {
                const r = await fetch('/api/workspace/read?path=' + encodeURIComponent(path));
                if (r.ok) { const data = await r.json(); scriptState.scriptText = data.content || ''; scriptState.filename = path; }
                else { window.showToast && window.showToast('读取文件失败', 'error'); }
            } catch (e) { window.showToast && window.showToast('读取失败', 'error'); }
        }
        function onGlobalClick(e) {
            if (treeVisible.value) {
                const dropdown = e.target.closest('.sb-tree-dropdown');
                if (!dropdown) treeVisible.value = false;
            }
        }
        onMounted(() => {
            loadFromServer();
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            document.addEventListener('click', onGlobalClick);
        });
        onBeforeUnmount(() => {
            saveIfNeeded(); clearTimeout(saveTimer);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            document.removeEventListener('click', onGlobalClick);
        });

        return {
            sbData, projectName, projects, nav, editTarget, tagsText, optimizeState,
            currentEpisode, currentScene, hasProject,
            treeVisible, treeExpandedIds, assistantState,
            navigate, drillDown, treeNav, toggleTreeExpand, openAssistant, closeAssistant, clearAssistant, sendAssistantMessage,
            addEntity, deleteEntity, startEdit, closeEdit,
            markDirty, updateTags, selectProject, autoLayout, syncWorkspace, generateFromShot, uploadAsset, uploadLocal,
            optimizePrompt, acceptOptimize, rejectOptimize, openPreview, closePreview, previewState, selectHistory,
            fitView: () => requestAnimationFrame(() => vfFitView({ padding: 0.2 })),
            hasPromptEdge: (nodeId) => vfGetEdges.value.some(e => e.target === nodeId && (e.targetHandle === 'prompt-in' || e.targetHandle === 'video-prompt-in')),
            getImgSizes: (modelId, tier) => getImageSizeOpts(modelId, tier),
            getImgTiers: (modelId) => Object.keys(IMAGE_MODEL_SIZES[modelId] || {}),
            onNodeDragStop, onConnect, onNodeClick, onNodeDoubleClick, onEdgeClick,
            onEditField, onPropField, onTagsInput, onNodeTypeChange, onDurationChange, onModelChange, onEdgeTextField,
            libraryState, openLibrary, closeLibrary, addLibraryItem, deleteLibraryItem, onLibField, onLibTags, uploadLibImage, generateLibImage,
            toggleBatchMode, toggleSelectLibItem, batchDeleteLibItems,
            scriptState, openScriptImport, closeScriptImport, startScriptAnalysis, generateSelectedImages, confirmImport,
            onScriptFileInput, onScriptWorkspacePick, textModels, friendlyModelName,
            screenwriterState, openScreenwriter, closeScreenwriter, sendScreenwriterMessage, generateScreenplay, useScreenplayForImport, saveScreenplayToWorkspace,
            mentionState, getConnectedRefs, getCombinedPrompt, showMentionPopup, hideMentionPopup, insertMentionRef,
            globalSettings, openGlobalSettings, closeGlobalSettings, applyGlobalImageSettings, applyGlobalVideoSettings,
        };
    },

    render() {
        const et = this.editTarget;
        const d = et?.data;
        const props = d?.properties || {};
        const isShotLevel = this.nav.level === 'shot';
        const isEdgeEdit = et?.type === 'edge';
        const srcType = et?.srcType;

        // Toolbar
        const tbBtns = [];
        if (!this.hasProject) { tbBtns.push(html`<button disabled class="sb-tb-btn sb-tb-disabled">请先选择项目</button>`); }
        else {
            if (this.nav.level === 'episode') tbBtns.push(html`<button onClick=${() => this.addEntity()} class="sb-tb-btn" title="新建剧集">+ 剧集</button>`);
            if (this.nav.level === 'scene') tbBtns.push(html`<button onClick=${() => this.addEntity()} class="sb-tb-btn" title="新建场景">+ 场景</button>`);
            if (isShotLevel) {
                tbBtns.push(html`<button onClick=${() => this.addEntity('text')} class="sb-tb-btn" title="添加提示词节点">\u{2728} 提示词</button>`);
                tbBtns.push(html`<button onClick=${() => this.addEntity('image')} class="sb-tb-btn" title="添加图像生成节点">\u{1F5BC} 图像</button>`);
                tbBtns.push(html`<button onClick=${() => this.addEntity('video')} class="sb-tb-btn" title="添加视频生成节点">\u{1F3AC} 视频</button>`);
                tbBtns.push(html`<button onClick=${() => this.addEntity('audio')} class="sb-tb-btn" title="添加音频节点">\u{1F3B5} 音频</button>`);
                tbBtns.push(html`<span class="sb-tb-sep"></span>`);
                tbBtns.push(html`<button onClick=${this.autoLayout} class="sb-tb-btn" title="自动排列节点布局">\u{1F4CA} 排列</button>`);
                tbBtns.push(html`<button onClick=${this.fitView} class="sb-tb-btn" title="适配视图显示所有节点">⌚ 适配</button>`);
            }
            tbBtns.push(html`<span class="sb-tb-sep"></span>`);
            if (this.nav.level === 'episode') {
                tbBtns.push(html`<button onClick=${() => this.openScriptImport('episodes')} class="sb-tb-btn" title="导入剧本并拆分剧集">\u{1F4C4} 剧本导入</button>`);
                tbBtns.push(html`<button onClick=${this.openScreenwriter} class="sb-tb-btn" title="AI 辅助剧本创作">\u{270D} 剧本创作</button>`);
            }
            if (this.nav.level === 'scene' && this.currentEpisode) {
                tbBtns.push(html`<button onClick=${() => this.openScriptImport('scenes')} class="sb-tb-btn" title="从剧本拆分场景">\u{1F4C4} 拆分场景</button>`);
            }
            if (isShotLevel && this.currentScene) {
                tbBtns.push(html`<button onClick=${() => this.openScriptImport('shots')} class="sb-tb-btn" title="从剧本拆分镜头">\u{1F4C4} 拆分镜头</button>`);
            }
            tbBtns.push(html`<button onClick=${this.syncWorkspace} class="sb-tb-btn" title="同步项目到工作空间文件夹">\u{1F4C2} 同步</button>`);
            tbBtns.push(html`<button onClick=${this.openLibrary} class="sb-tb-btn" title="管理角色、道具、场景素材">\u{1F4DA} 素材库</button>`);
            if (isShotLevel) tbBtns.push(html`<button onClick=${this.openGlobalSettings} class="sb-tb-btn" title="批量设置图像/视频生成参数">\u{2699} 全局设置</button>`);
        }

        // Tree dropdown widget (inserted into crumbs after project select)
        const treeDropdown = this.hasProject ? html`
            <div class="sb-tree-dropdown">
                <button class="sb-tree-toggle" title="切换树形导航" onClick=${() => { this.treeVisible = !this.treeVisible; }}>
                    📁 <span>目录</span> <span style=${this.treeVisible ? 'transform:rotate(90deg)' : ''}>▶</span>
                </button>
                ${this.treeVisible ? html`
                    <div class="sb-tree-panel">
                        <div class="sb-tree-body">
                            <div class=${this.nav.level === 'episode' ? 'sb-tree-item active' : 'sb-tree-item'}
                                onClick=${() => this.treeNav(null, null)}>
                                <span class="sb-tree-icon">🏠</span>
                                <span>全部剧集</span>
                            </div>
                            ${Object.values(this.sbData.episodes).map(ep => {
                                const expanded = this.treeExpandedIds.has(ep.id);
                                return html`
                                <div key=${ep.id} class="sb-tree-group">
                                    <div class=${this.nav.episodeId === ep.id && this.nav.level === 'scene' ? 'sb-tree-item active' : this.nav.episodeId === ep.id && this.nav.level === 'shot' ? 'sb-tree-item parent-active' : 'sb-tree-item'}>
                                        <button class="sb-tree-arrow" title="展开/折叠" onClick=${e => this.toggleTreeExpand(ep.id, e)}>
                                            <span style=${expanded ? 'transform:rotate(90deg)' : ''}>▶</span>
                                        </button>
                                        <span class="sb-tree-icon" onClick=${() => this.treeNav(ep.id, null)}>🎬</span>
                                        <span class="sb-tree-label" onClick=${() => this.treeNav(ep.id, null)}>${ep.title || '(未命名剧集)'}</span>
                                        <span class="sb-tree-count" onClick=${() => this.treeNav(ep.id, null)}>${Object.keys(ep.scenes || {}).length}</span>
                                    </div>
                                    ${expanded ? Object.values(ep.scenes || {}).map(sc => html`
                                                    <div key=${sc.id}
                                                        class=${this.nav.sceneId === sc.id && this.nav.level === 'shot' ? 'sb-tree-item child active' : 'sb-tree-item child'}
                                                        onClick=${() => this.treeNav(ep.id, sc.id)}>
                                                        <span class="sb-tree-icon">🏖</span>
                                                        <span class="sb-tree-label">${sc.title || '(未命名场景)'}</span>
                                                        <span class="sb-tree-count">${Object.keys(sc.shots || {}).length}</span>
                                                    </div>
                                                `) : null}
                                            </div>`;
                                        })}
                                    </div>
                                </div>
                            ` : null}
                        </div>
                    ` : null;

        // Breadcrumb
        const crumbs = [];
        if (this.projects.length > 0) { crumbs.push(html`<select class="sb-project-select" value=${this.projectName} onChange=${e => this.selectProject(e.target.value)}><option value="" disabled>选择项目...</option>${this.projects.map(p => html`<option value=${p.name} key=${p.name}>${p.name}</option>`)}</select>`); }
        else { crumbs.push(html`<span class="sb-crumb" style="color:var(--text-secondary)">无项目，请先在工作空间创建项目</span>`); }
        if (this.hasProject) {
            crumbs.push(html`<span class="sb-crumb-sep">|</span>`);
            crumbs.push(treeDropdown);
            crumbs.push(html`<span class="sb-crumb-sep">|</span>`);
            crumbs.push(html`<span class=${this.nav.level === 'episode' ? 'sb-crumb active' : 'sb-crumb'} onClick=${() => this.navigate('episode')}>剧集</span>`);
            if (this.currentEpisode) { crumbs.push(html`<span class="sb-crumb-sep">/</span>`); crumbs.push(html`<span class=${this.nav.level === 'scene' ? 'sb-crumb active' : 'sb-crumb'} onClick=${() => this.navigate('scene')}>${this.currentEpisode.title || '(...)'}</span>`); }
            if (this.currentEpisode && this.currentScene && isShotLevel) { crumbs.push(html`<span class="sb-crumb-sep">/</span>`); crumbs.push(html`<span class="sb-crumb active">${this.currentScene.title || '(...)'}</span>`); }
        }

        // Card grid
        const cards = [];
        if (this.nav.level === 'episode') {
            const eps = Object.values(this.sbData.episodes);
            if (!eps.length) cards.push(html`<div class="sb-card-empty">暂无剧集，点击上方"+ 剧集"按钮添加</div>`);
            eps.forEach(ep => cards.push(html`<div class="sb-card" key=${ep.id} onClick=${() => this.startEdit(ep.id)}>
                <button class="sb-card-del" title="删除剧集" onClick=${e => { e.stopPropagation(); this.deleteEntity(ep.id); }}>✕</button>
                <div class="sb-card-header"><span class="sb-card-icon">\u{1F3AC}</span><span class="sb-card-title">${ep.title || '(未命名剧集)'}</span></div>
                ${ep.summary ? html`<div class="sb-card-summary">${ep.summary}</div>` : null}
                ${ep.tags?.length ? html`<div class="sb-card-tags">${ep.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}
                <div class="sb-card-footer"><button class="sb-card-enter" title="进入场景编辑" onClick=${e => { e.stopPropagation(); this.drillDown(ep.id); }}>进入场景 →</button></div>
            </div>`));
        } else if (this.nav.level === 'scene') {
            const scenes = this.currentEpisode ? Object.values(this.currentEpisode.scenes) : [];
            if (!scenes.length) cards.push(html`<div class="sb-card-empty">暂无场景，点击上方"+ 场景"按钮添加</div>`);
            scenes.forEach(sc => cards.push(html`<div class="sb-card" key=${sc.id} onClick=${() => this.startEdit(sc.id)}>
                <button class="sb-card-del" title="删除场景" onClick=${e => { e.stopPropagation(); this.deleteEntity(sc.id); }}>✕</button>
                <div class="sb-card-header"><span class="sb-card-icon">\u{1F3DD}</span><span class="sb-card-title">${sc.title || '(未命名场景)'}</span></div>
                ${sc.summary ? html`<div class="sb-card-summary">${sc.summary}</div>` : null}
                ${sc.tags?.length ? html`<div class="sb-card-tags">${sc.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}
                <div class="sb-card-footer"><button class="sb-card-enter" title="进入分镜画布" onClick=${e => { e.stopPropagation(); this.drillDown(sc.id); }}>进入分镜 →</button></div>
            </div>`));
        }

        // Edit panel — node or edge
        const editPanel = et ? html`
            <div class="sb-edit-panel">
                <div class="sb-edit-header">
                    <h3>${isEdgeEdit ? '编辑连线' : et.type === 'episode' ? '编辑剧集' : et.type === 'scene' ? '编辑场景' : '属性'}</h3>
                    <button onClick=${this.closeEdit} class="sb-del-btn" title="关闭">✕</button>
                </div>
                <div class="sb-edit-body">
                    ${isEdgeEdit ? html`
                        <p style="font-size:12px;color:var(--text-muted);margin:0">源节点类型: <b>${srcType}</b></p>
                        ${srcType === 'text' ? html`
                            <p style="font-size:12px;color:var(--text-secondary);margin:4px 0">提示词内容由源节点管理</p>
                        ` : null}
                        ${srcType === 'image' ? html`
                            <label>图片角色</label>
                            <select value=${d.imageRole || 'reference'} onChange=${e => {
                                const newRole = e.target.value;
                                const sc = this.currentScene;
                                if (!sc || !et.edge) { d.imageRole = newRole; this.markDirty(); return; }
                                const tgtHandle = et.edge.targetHandle;
                                if (tgtHandle === 'video-image-in') {
                                    const siblings = sc.flow.edges.filter(e2 => e2.id !== et.id && e2.target === et.edge.target && e2.targetHandle === 'video-image-in');
                                    const hasRef = newRole === 'reference' ? false : siblings.some(e2 => e2.data?.imageRole === 'reference');
                                    const hasFrame = (newRole === 'firstFrame' || newRole === 'lastFrame') ? false : siblings.some(e2 => e2.data?.imageRole === 'firstFrame' || e2.data?.imageRole === 'lastFrame');
                                    if (newRole === 'reference' && siblings.some(e2 => e2.data?.imageRole === 'firstFrame' || e2.data?.imageRole === 'lastFrame')) {
                                        window.showToast && window.showToast('已存在首/尾帧，不能设为参考图', 'error'); return;
                                    }
                                    if ((newRole === 'firstFrame' || newRole === 'lastFrame') && siblings.some(e2 => e2.data?.imageRole === 'reference')) {
                                        window.showToast && window.showToast('已存在参考图，不能设为首/尾帧', 'error'); return;
                                    }
                                }
                                d.imageRole = newRole; this.markDirty();
                            }}>
                                <option value="reference">参考图</option>
                                <option value="firstFrame">首帧</option>
                                <option value="lastFrame">尾帧</option>
                            </select>
                        ` : null}
                        ${srcType === 'video' ? html`
                            <p style="font-size:12px;color:var(--text-secondary);margin:4px 0">参考视频连接</p>
                        ` : null}
                        ${srcType === 'audio' ? html`
                            <p style="font-size:12px;color:var(--text-secondary);margin:4px 0">参考音频连接</p>
                        ` : null}
                    ` : html`
                        <label>标题</label>
                        <input value=${d.title || ''} onInput=${e => this.onEditField('title', e)} placeholder="输入标题..." />
                        <label>简介</label>
                        <textarea value=${d.summary || ''} onInput=${e => this.onEditField('summary', e)} rows="4" placeholder="简要描述..."></textarea>
                        <label>备注</label>
                        <textarea value=${d.notes || ''} onInput=${e => this.onEditField('notes', e)} rows="4" placeholder="补充备注..."></textarea>
                        ${et.type === 'shot' ? html`
                            ${d.nodeType === 'text' ? html`
                                <label>提示词</label>
                                <textarea value=${props.text?.prompt || ''} onInput=${e => this.onPropField('text', 'prompt', e)} rows="6" placeholder="输入提示词..."></textarea>
                            ` : null}
                            ${d.nodeType === 'image' ? html`
                                <div style="display:flex;justify-content:space-between;align-items:center">
                                    <label style="margin:0">提示词</label>
                                    <button class="sb-mention-btn" disabled=${!this.getConnectedRefs(et.id).length} onClick=${() => this.showMentionPopup(et.id)} title=${this.getConnectedRefs(et.id).length ? '插入参考资源 (@)' : '需要连接参考资源节点'}>@ 参考</button>
                                </div>
                                <textarea value=${this.getCombinedPrompt(et.id) || props.image?.prompt || ''} onInput=${e => this.onPropField('image', 'prompt', e)} rows="5" placeholder="图像提示词..." class=${this.hasPromptEdge(et.id) ? 'sb-readonly' : ''}></textarea>
                                ${this.hasPromptEdge(et.id) ? html`<p style="font-size:11px;color:var(--text-secondary);margin:2px 0">已连接提示词节点，提示词由连线提供</p>` : null}
                                <label>模型</label>
                                <select value=${props.image?.model || ''} onChange=${e => { props.image.model = e.target.value; props.image.sizeTier = (this.getImgTiers(e.target.value) || [])[0]; props.image.size = (this.getImgSizes(e.target.value, props.image.sizeTier) || [{}])[0]?.value || '1024x1024'; this.markDirty(); }}>
                                    <option value="doubao-seedream-4-0-250828">Seedream 4.0</option>
                                    <option value="doubao-seedream-4-5-251128">Seedream 4.5</option>
                                    <option value="doubao-seedream-5-0-260128">Seedream 5.0 Lite</option>
                                </select>
                                <label>分辨率档位</label>
                                <select value=${props.image?.sizeTier || '1K'} onChange=${e => { props.image.sizeTier = e.target.value; props.image.size = (this.getImgSizes(props.image.model, e.target.value) || [{}])[0]?.value || '1024x1024'; this.markDirty(); }}>
                                    ${this.getImgTiers(props.image?.model || 'doubao-seedream-4-0-250828').map(t => html`<option value=${t} key=${t}>${t}</option>`)}
                                </select>
                                <label>尺寸</label>
                                <select value=${props.image?.size || '1024x1024'} onChange=${e => { props.image.size = e.target.value; this.markDirty(); }}>
                                    ${this.getImgSizes(props.image?.model || 'doubao-seedream-4-0-250828', props.image?.sizeTier || '1K').map(s => html`<option value=${s.value} key=${s.value}>${s.value} (${s.label})</option>`)}
                                </select>
                                <label style="display:flex;align-items:center;gap:6px">
                                    <input type="checkbox" checked=${props.image?.followInput || false} onChange=${e => { props.image.followInput = e.target.checked; this.markDirty(); }} />
                                    <span>跟随输入图分辨率和比例</span>
                                </label>
                                ${props.image?.followInput ? html`<p style="font-size:11px;color:var(--text-secondary);margin:2px 0">将使用第一张参考图片的分辨率和比例</p>` : null}
                                <label style="display:flex;align-items:center;gap:6px;margin-top:4px">
                                    <input type="checkbox" checked=${props.image?.webSearch || false} onChange=${e => { props.image.webSearch = e.target.checked; this.markDirty(); }} />
                                    <span>联网搜索</span>
                                </label>
                            ` : null}
                            ${d.nodeType === 'video' ? html`
                                <div style="display:flex;justify-content:space-between;align-items:center">
                                    <label style="margin:0">提示词</label>
                                    <button class="sb-mention-btn" disabled=${!this.getConnectedRefs(et.id).length} onClick=${() => this.showMentionPopup(et.id)} title=${this.getConnectedRefs(et.id).length ? '插入参考资源 (@)' : '需要连接参考资源节点'}>@ 参考</button>
                                </div>
                                <textarea value=${this.getCombinedPrompt(et.id) || props.video?.prompt || ''} onInput=${e => this.onPropField('video', 'prompt', e)} rows="5" placeholder="视频提示词..." class=${this.hasPromptEdge(et.id) ? 'sb-readonly' : ''}></textarea>
                                ${this.hasPromptEdge(et.id) ? html`<p style="font-size:11px;color:var(--text-secondary);margin:2px 0">已连接提示词节点，提示词由连线提供</p>` : null}
                                <label>模型</label>
                                <select value=${props.video?.model || ''} onChange=${e => this.onModelChange('video', e)}><option value="doubao-seedance-2-0-260128">Seedance 2.0</option><option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option></select>
                                ${!props.video?.followInput ? html`
                                <label>分辨率</label>
                                <select value=${props.video?.resolution || '1080p'} onChange=${e => { props.video.resolution = e.target.value; this.markDirty(); }}>
                                    <option value="480p">480p</option>
                                    <option value="720p">720p</option>
                                    <option value="1080p">1080p</option>
                                </select>
                                <label>画面比例</label>
                                <select value=${props.video?.aspect || '1:1'} onChange=${e => { props.video.aspect = e.target.value; this.markDirty(); }}>
                                    <option value="21:9">21:9</option>
                                    <option value="16:9">16:9</option>
                                    <option value="4:3">4:3</option>
                                    <option value="1:1">1:1</option>
                                    <option value="3:4">3:4</option>
                                    <option value="9:16">9:16</option>
                                </select>
                                ` : html`<p style="font-size:12px;color:var(--accent-indigo);margin:4px 0;padding:6px;background:var(--accent-indigo-muted);border-radius:4px">跟随第一张参考图片的分辨率和比例</p>`}
                                <label style="display:flex;align-items:center;justify-content:space-between">时长（秒）<span style="font-weight:600;color:var(--accent-indigo)">${props.video?.duration || 5}s</span></label>
                                <input type="range" min="4" max="15" step="1" value=${props.video?.duration || 5} onInput=${this.onDurationChange} class="sb-range-slider" />
                                <label style="display:flex;align-items:center;gap:6px;margin-top:4px">
                                    <input type="checkbox" checked=${props.video?.followInput || false} onChange=${e => { props.video.followInput = e.target.checked; this.markDirty(); }} />
                                    <span>跟随输入图分辨率和比例</span>
                                </label>
                                <label style="display:flex;align-items:center;gap:6px">
                                    <input type="checkbox" checked=${props.video?.webSearch || false} onChange=${e => { props.video.webSearch = e.target.checked; this.markDirty(); }} />
                                    <span>联网搜索</span>
                                </label>
                            ` : null}
                            ${d.nodeType === 'audio' ? html`
                                <label>时长（秒）</label>
                                <input type="number" value=${props.audio?.duration || 0} onInput=${e => { if (props.audio) { props.audio.duration = Number(e.target.value); this.markDirty(); } }} min="0" />
                            ` : null}
                        ` : null}
                    `}
                </div>
            </div>
        ` : null;

        // Optimization comparison dialog
        const optimizeDialog = this.optimizeState.show ? html`
            <div class="sb-optimize-overlay">
                <div class="sb-optimize-dialog">
                    <div class="sb-optimize-header">
                        <h3>提示词优化对比</h3>
                        <button onClick=${this.rejectOptimize} class="sb-del-btn" title="关闭">✕</button>
                    </div>
                    <div class="sb-optimize-body">
                        <div class="sb-optimize-col">
                            <label>原始提示词</label>
                            <div class="sb-optimize-text">${this.optimizeState.original}</div>
                        </div>
                        <div class="sb-optimize-col">
                            <label>优化后</label>
                            <div class="sb-optimize-text">${this.optimizeState.loading ? '正在优化...' : this.optimizeState.optimized}</div>
                        </div>
                    </div>
                    ${!this.optimizeState.loading ? html`
                        <div class="sb-optimize-actions">
                            <button class="sb-optimize-reject" title="取消优化" onClick=${this.rejectOptimize}>取消</button>
                            <button class="sb-optimize-accept" title="采用优化后的提示词" onClick=${this.acceptOptimize}>采用优化结果</button>
                        </div>
                    ` : null}
                </div>
            </div>
        ` : null;

        // Library dialog
        const ls = this.libraryState;
        const libChars = Object.values(this.sbData.characters || {});
        const libProps = Object.values(this.sbData.props || {});
        const libScenes = Object.values(this.sbData.scenes || {});
        const libEditItem = ls.editId ? (this.sbData.characters[ls.editId] || this.sbData.props[ls.editId] || this.sbData.scenes[ls.editId] || null) : null;
        const libEditType = ls.editId && this.sbData.characters[ls.editId] ? 'character' : ls.editId && this.sbData.props[ls.editId] ? 'prop' : ls.editId && this.sbData.scenes[ls.editId] ? 'scene' : null;
        const libraryDialog = ls.show ? html`
            <div class="sb-lib-overlay" onClick=${this.closeLibrary}>
                <div class="sb-lib-dialog" onClick=${e => e.stopPropagation()}>
                    <div class="sb-lib-header">
                        <h3>素材库</h3>
                        <button onClick=${this.closeLibrary} class="sb-del-btn" title="关闭">✕</button>
                    </div>
                    <div class="sb-lib-tabs">
                        <div class="sb-lib-tabs-left">
                            <button class=${ls.tab === 'character' ? 'sb-lib-tab active' : 'sb-lib-tab'} title="角色素材" onClick=${() => { ls.tab = 'character'; ls.editId = null; }}>角色 (${libChars.length})</button>
                            <button class=${ls.tab === 'prop' ? 'sb-lib-tab active' : 'sb-lib-tab'} title="道具素材" onClick=${() => { ls.tab = 'prop'; ls.editId = null; }}>道具 (${libProps.length})</button>
                            <button class=${ls.tab === 'scene' ? 'sb-lib-tab active' : 'sb-lib-tab'} title="场景素材" onClick=${() => { ls.tab = 'scene'; ls.editId = null; }}>场景 (${libScenes.length})</button>
                        </div>
                        <div class="sb-lib-tabs-right">
                            <button class="sb-lib-add" title="添加新素材" onClick=${() => this.addLibraryItem(ls.tab)}>+ 添加</button>
                            <button class=${ls.batchMode ? 'sb-lib-add active' : 'sb-lib-add'} title="多选模式" onClick=${this.toggleBatchMode}>${ls.batchMode ? '取消多选' : '多选'}</button>
                            ${ls.batchMode ? html`<button class="sb-lib-add sb-lib-del-batch" title="批量删除选中素材" onClick=${this.batchDeleteLibItems} disabled=${!Object.keys(ls.selectedIds).length}>删除选中 (${Object.keys(ls.selectedIds).length})</button>` : null}
                        </div>
                    </div>
                    <div class="sb-lib-body">
                        ${ls.tab === 'character' ? (libChars.length ? html`<div class="sb-lib-grid">${libChars.map(c => html`
                            <div class=${ls.editId === c.id ? 'sb-lib-card active' : 'sb-lib-card'} key=${c.id} onClick=${ls.batchMode ? () => this.toggleSelectLibItem(c.id) : () => { ls.editId = c.id; }}>
                                ${ls.batchMode ? html`<div class=${ls.selectedIds[c.id] ? 'sb-lib-check-mark checked' : 'sb-lib-check-mark'}></div>` : null}
                                <div class="sb-lib-card-img">${c.imageAsset ? html`<img src=${'/workspace/' + c.imageAsset} />` : html`<div class="sb-lib-card-placeholder">${(c.name || '?')[0]}</div>`}</div>
                                <div class="sb-lib-card-name">${c.name || '(未命名)'}</div>
                                ${c.tags?.length ? html`<div class="sb-lib-card-tags">${c.tags.slice(0, 3).map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}
                            </div>
                        `)}</div>` : html`<div class="sb-lib-empty">暂无角色，点击"+ 添加"创建</div>`) : ls.tab === 'prop' ? (libProps.length ? html`<div class="sb-lib-grid">${libProps.map(p => html`
                            <div class=${ls.editId === p.id ? 'sb-lib-card active' : 'sb-lib-card'} key=${p.id} onClick=${ls.batchMode ? () => this.toggleSelectLibItem(p.id) : () => { ls.editId = p.id; }}>
                                ${ls.batchMode ? html`<div class=${ls.selectedIds[p.id] ? 'sb-lib-check-mark checked' : 'sb-lib-check-mark'}></div>` : null}
                                <div class="sb-lib-card-img">${p.imageAsset ? html`<img src=${'/workspace/' + p.imageAsset} />` : html`<div class="sb-lib-card-placeholder">${(p.name || '?')[0]}</div>`}</div>
                                <div class="sb-lib-card-name">${p.name || '(未命名)'}</div>
                                ${p.category ? html`<div class="sb-lib-card-cat">${p.category}</div>` : null}
                            </div>
                        `)}</div>` : html`<div class="sb-lib-empty">暂无道具，点击"+ 添加"创建</div>`) : (libScenes.length ? html`<div class="sb-lib-grid">${libScenes.map(s => html`
                            <div class=${ls.editId === s.id ? 'sb-lib-card active' : 'sb-lib-card'} key=${s.id} onClick=${ls.batchMode ? () => this.toggleSelectLibItem(s.id) : () => { ls.editId = s.id; }}>
                                ${ls.batchMode ? html`<div class=${ls.selectedIds[s.id] ? 'sb-lib-check-mark checked' : 'sb-lib-check-mark'}></div>` : null}
                                <div class="sb-lib-card-img">${s.imageAsset ? html`<img src=${'/workspace/' + s.imageAsset} />` : html`<div class="sb-lib-card-placeholder">${(s.name || '?')[0]}</div>`}</div>
                                <div class="sb-lib-card-name">${s.name || '(未命名)'}</div>
                                ${s.category ? html`<div class="sb-lib-card-cat">${s.category}</div>` : null}
                            </div>
                        `)}</div>` : html`<div class="sb-lib-empty">暂无场景，点击"+ 添加"创建</div>`)}
                        ${libEditItem ? html`
                            <div class="sb-lib-edit">
                                <div class="sb-lib-edit-header">
                                    <h4>编辑${libEditType === 'character' ? '角色' : libEditType === 'prop' ? '道具' : '场景'}</h4>
                                    <button class="sb-lib-del-btn" title="删除素材" onClick=${() => this.deleteLibraryItem(libEditType, libEditItem.id)}>删除</button>
                                </div>
                                <label>名称</label>
                                <input value=${libEditItem.name || ''} onInput=${e => this.onLibField('name', e)} placeholder="输入名称..." />
                                <label>描述</label>
                                <textarea value=${libEditItem.description || ''} onInput=${e => this.onLibField('description', e)} rows="3" placeholder="详细描述（用于生成参考图）..."></textarea>
                                ${(libEditType === 'prop' || libEditType === 'scene') ? html`<label>分类</label><input value=${libEditItem.category || ''} onInput=${e => this.onLibField('category', e)} placeholder=${libEditType === 'prop' ? '道具/场景/载具/武器...' : '室外/室内/科幻/古代...'} />` : null}
                                <label>标签（逗号分隔）</label>
                                <input value=${(libEditItem.tags || []).join(', ')} onInput=${e => this.onLibTags(e)} placeholder="主角, 男性..." />
                                <div class="sb-lib-img-section">
                                    <label>画风</label>
                                    <select class="sb-lib-style-sel" value=${this.libraryState.styleIndex} onChange=${e => { this.libraryState.styleIndex = parseInt(e.target.value); }}>
                                        ${STYLE_PRESETS.map((s, i) => html`<option value=${i} key=${i}>${s.label}</option>`)}
                                    </select>
                                    ${this.libraryState.styleIndex === STYLE_PRESETS.length - 1 ? html`<input class="sb-lib-style-custom" value=${this.libraryState.styleCustom} onInput=${e => { this.libraryState.styleCustom = e.target.value; }} placeholder="输入自定义画风描述..." />` : null}
                                </div>
                                <div class="sb-lib-img-section">
                                    <label>参考图</label>
                                    <div class="sb-lib-img-preview">
                                        ${libEditItem.imageAsset ? html`<img src=${'/workspace/' + libEditItem.imageAsset} onClick=${e => { e.stopPropagation(); this.openPreview({ type: 'image', url: '/workspace/' + libEditItem.imageAsset, title: libEditItem.name || '参考图' }); }} style="cursor:pointer" />` : html`<div class="sb-lib-img-empty">暂无参考图</div>`}
                                    </div>
                                    <div class="sb-lib-img-actions">
                                        <button class="sb-lib-btn" title="上传参考图" onClick=${() => this.uploadLibImage(libEditType, libEditItem.id)}>\u{1F4E4} 上传图片</button>
                                        <button class="sb-lib-btn primary" title="AI 生成参考图" onClick=${() => this.generateLibImage(libEditType, libEditItem.id)} disabled=${this.libraryState.generating}>${this.libraryState.generating ? '生成中...' : '\u{2728} AI生成'}</button>
                                    </div>
                                </div>
                            </div>
                        ` : null}
                    </div>
                </div>
            </div>
        ` : null;


        return html`
            <div class="sb-root">
                <div class="sb-breadcrumb">${crumbs}</div>
                <div class="sb-toolbar">${tbBtns}</div>
                <div class="sb-main">
                    <div class="sb-canvas" style=${isShotLevel ? '' : 'display:none'}>
                        <${VueFlow} nodeTypes=${SHOT_NODE_TYPES} defaultEdgeOptions=${{ animated: true }} fitViewOnInit=${true}
                            connectionRadius=${30} snapToEnd=${true} snapRadius=${30}
                            onNodeDragStop=${this.onNodeDragStop} onConnect=${this.onConnect}
                            onNodeClick=${this.onNodeClick} onNodeDoubleClick=${this.onNodeDoubleClick} onEdgeClick=${this.onEdgeClick}
                            style="width:100%;height:100%;">
                            <${Background} gap=${20} /><${MiniMap} />
                        </${VueFlow}>
                    </div>
                    ${!isShotLevel ? html`<div class="sb-card-grid">${cards}</div>` : null}
                    ${editPanel}
                    ${optimizeDialog}
                </div>
                <button class="sb-assistant-fab" onClick=${this.openAssistant} title="AI 助手">
                    <img src="/resource/Run_elephant.png" alt="AI助手" />
                </button>
                ${this.assistantState.show ? html`
                    <div class="sb-assistant-panel">
                        <div class="sb-assistant-header">
                            <span>🐘 想象</span>
                            <span style="display:flex;gap:2px;align-items:center">
                                <button class="sb-assistant-close" title="清空聊天记录" onClick=${this.clearAssistant}>\u{1F5D1}</button>
                                <button class="sb-assistant-close" title="关闭" onClick=${this.closeAssistant}>✕</button>
                            </span>
                        </div>
                        <div class="sb-assistant-messages">
                            ${this.assistantState.messages.length === 0 ? html`<div class="sb-assistant-hint">你好！我是Story Board的AI助手，我叫想象，可以帮你优化提示词、分析剧本、设计分镜等。有什么可以帮你的？</div>` : null}
                            ${this.assistantState.messages.map((m, i) => html`
                                <div key=${i} class=${m.role === 'user' ? 'sb-assistant-msg user' : 'sb-assistant-msg bot'}>${m.content}</div>
                            `)}
                            ${this.assistantState.loading ? html`<div class="sb-assistant-msg bot">思考中...</div>` : null}
                        </div>
                        <div class="sb-assistant-input">
                            <input value=${this.assistantState.input} onInput=${e => { this.assistantState.input = e.target.value; }} onKeydown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendAssistantMessage(); } }} placeholder="输入问题..." />
                            <button title="发送消息" onClick=${this.sendAssistantMessage} disabled=${this.assistantState.loading || !this.assistantState.input.trim()}>发送</button>
                        </div>
                    </div>
                ` : null}
                ${libraryDialog}
                ${this.globalSettings.show ? html`
                <div class="sb-gs-overlay" onClick=${this.closeGlobalSettings} onKeyDown=${e => { if (e.key === 'Escape') this.closeGlobalSettings(); }} ref=${el => { if (el) el.focus(); }} tabIndex=${-1}>
                    <div class="sb-gs-dialog" role="dialog" aria-modal="true" aria-label="全局设置" onClick=${e => e.stopPropagation()}>
                        <div class="sb-gs-header">
                            <h3>
                                <svg class="sb-gs-header-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v2m0 14v2m-9-9h2m14 0h2m-2.636-6.364l-1.414 1.414M4.05 15.95l-1.414 1.414m0-12.728l1.414 1.414M15.95 15.95l1.414 1.414"/></svg>
                                全局设置
                            </h3>
                            <button onClick=${this.closeGlobalSettings} class="sb-del-btn" title="关闭" aria-label="关闭">✕</button>
                        </div>
                        <div class="sb-gs-tabs" role="tablist">
                            <button class=${this.globalSettings.tab === 'image' ? 'sb-gs-tab active' : 'sb-gs-tab'} role="tab" title="图像生成设置" aria-selected=${this.globalSettings.tab === 'image'} onClick=${() => { this.globalSettings.tab = 'image'; }}>
                                <svg class="sb-gs-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="2" width="14" height="12" rx="2"/><circle cx="5.5" cy="6.5" r="1.5"/><path d="m15 10-3-3-5 5"/></svg>
                                图像节点
                            </button>
                            <button class=${this.globalSettings.tab === 'video' ? 'sb-gs-tab active' : 'sb-gs-tab'} role="tab" title="视频生成设置" aria-selected=${this.globalSettings.tab === 'video'} onClick=${() => { this.globalSettings.tab = 'video'; }}>
                                <svg class="sb-gs-tab-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="10" height="10" rx="2"/><path d="m11 6 4-2v8l-4-2"/></svg>
                                视频节点
                            </button>
                        </div>
                        ${this.globalSettings.tab === 'image' ? html`
                            <div class="sb-gs-section" role="tabpanel">
                                <label>模型</label>
                                <select value=${this.globalSettings.imageModel} onChange=${e => {
                                    this.globalSettings.imageModel = e.target.value;
                                    const tiers = Object.keys(IMAGE_MODEL_SIZES[e.target.value] || {});
                                    this.globalSettings.imageSizeTier = tiers[0] || '2K';
                                    const opts = getImageSizeOpts(e.target.value, tiers[0]);
                                    this.globalSettings.imageSize = opts.length ? opts[0].value : '1024x1024';
                                }}>
                                    <option value="doubao-seedream-4-0-250828">Seedream 4.0</option>
                                    <option value="doubao-seedream-4-5-251128">Seedream 4.5</option>
                                    <option value="doubao-seedream-5-0-260128">Seedream 5.0 Lite</option>
                                </select>
                                <label>分辨率档位</label>
                                <select value=${this.globalSettings.imageSizeTier} onChange=${e => {
                                    this.globalSettings.imageSizeTier = e.target.value;
                                    const opts = getImageSizeOpts(this.globalSettings.imageModel, e.target.value);
                                    this.globalSettings.imageSize = opts.length ? opts[0].value : '1024x1024';
                                }}>
                                    ${(this.getImgTiers(this.globalSettings.imageModel) || []).map(t => html`<option value=${t} key=${t}>${t}</option>`)}
                                </select>
                                <label>画面比例</label>
                                <select value=${this.globalSettings.imageSize} onChange=${e => { this.globalSettings.imageSize = e.target.value; }}>
                                    ${this.getImgSizes(this.globalSettings.imageModel, this.globalSettings.imageSizeTier).map(s => html`<option value=${s.value} key=${s.value}>${s.label} (${s.value})</option>`)}
                                </select>
                                <p class="sb-gs-hint">将覆盖当前场景所有图像节点的模型、分辨率和比例设置</p>
                                <div class="sb-gs-actions">
                                    <button class="sb-gs-btn" title="取消" onClick=${this.closeGlobalSettings}>取消</button>
                                    <button class="sb-gs-btn primary" title="将设置应用到所有图像节点" onClick=${() => { if (confirm('确认将当前设置应用到所有图像节点？已有的模型和尺寸设置将被覆盖。')) this.applyGlobalImageSettings(); }}>应用到所有图像节点</button>
                                </div>
                            </div>
                        ` : html`
                            <div class="sb-gs-section" role="tabpanel">
                                <label>模型</label>
                                <select value=${this.globalSettings.videoModel} onChange=${e => { this.globalSettings.videoModel = e.target.value; }}>
                                    <option value="doubao-seedance-2-0-260128">Seedance 2.0</option>
                                    <option value="doubao-seedance-2-0-fast-260128">Seedance 2.0 Fast</option>
                                </select>
                                <label>分辨率</label>
                                <select value=${this.globalSettings.videoResolution} onChange=${e => { this.globalSettings.videoResolution = e.target.value; }}>
                                    <option value="480p">480p</option>
                                    <option value="720p">720p</option>
                                    <option value="1080p">1080p</option>
                                </select>
                                <label>画面比例</label>
                                <select value=${this.globalSettings.videoAspect} onChange=${e => { this.globalSettings.videoAspect = e.target.value; }}>
                                    <option value="21:9">21:9</option>
                                    <option value="16:9">16:9</option>
                                    <option value="4:3">4:3</option>
                                    <option value="1:1">1:1</option>
                                    <option value="3:4">3:4</option>
                                    <option value="9:16">9:16</option>
                                </select>
                                <p class="sb-gs-hint">将覆盖当前场景所有视频节点的模型、分辨率和比例设置</p>
                                <div class="sb-gs-actions">
                                    <button class="sb-gs-btn" title="取消" onClick=${this.closeGlobalSettings}>取消</button>
                                    <button class="sb-gs-btn primary" title="将设置应用到所有视频节点" onClick=${() => { if (confirm('确认将当前设置应用到所有视频节点？已有的模型和尺寸设置将被覆盖。')) this.applyGlobalVideoSettings(); }}>应用到所有视频节点</button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            ` : null}
            ${this.previewState.show ? html`
                    <div class="sb-preview-overlay" onClick=${this.closePreview}>
                        <div class="sb-preview-dialog" onClick=${e => e.stopPropagation()}>
                            <div class="sb-preview-header">
                                <h3>${this.previewState.title}</h3>
                                <button onClick=${this.closePreview} class="sb-del-btn" title="关闭">✕</button>
                            </div>
                            <div class="sb-preview-body">
                                ${this.previewState.type === 'image' ? html`<img src=${this.previewState.url} style="max-width:100%;max-height:70vh;border-radius:8px" />` : null}
                                ${this.previewState.type === 'video' ? html`<video src=${this.previewState.url} controls autoplay style="max-width:100%;max-height:70vh;border-radius:8px" />` : null}
                                ${this.previewState.type === 'audio' ? html`<audio src=${this.previewState.url} controls autoplay style="width:100%" />` : null}
                                ${this.previewState.type === 'text' ? html`<iframe src=${this.previewState.url} style="width:100%;height:70vh;border:none;border-radius:8px" />` : null}
                            </div>
                        </div>
                    </div>
                ` : null}
                ${this.scriptState.show ? html`
                    <div class="sb-imp-overlay" onClick=${this.closeScriptImport}>
                        <div class="sb-imp-dialog" onClick=${e => e.stopPropagation()}>
                            <div class="sb-imp-header">
                                <h3>${this.scriptState.level === 'episodes' ? '剧本导入' : this.scriptState.level === 'scenes' ? '拆分场景' : '拆分镜头'}</h3>
                                <button onClick=${this.closeScriptImport} class="sb-del-btn" title="关闭">✕</button>
                            </div>
                            <div class="sb-imp-body">
                                ${this.scriptState.step === 'idle' || this.scriptState.step === 'analyzing' ? html`
                                    ${this.scriptState.level === 'episodes' ? html`
                                        <div class="sb-imp-section">
                                            <div style="display:flex;align-items:center;justify-content:space-between">
                                                <label style="margin:0">剧本内容</label>
                                                <div style="display:flex;gap:4px">
                                                    <button title="上传文件" onClick=${this.onScriptFileInput} style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;color:var(--text-muted);transition:color .15s" onMouseEnter=${e => e.target.style.color='var(--accent-indigo)'} onMouseLeave=${e => e.target.style.color='var(--text-muted)'}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                                                    <button title="从工作空间选择" onClick=${this.onScriptWorkspacePick} style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;color:var(--text-muted);transition:color .15s" onMouseEnter=${e => e.target.style.color='var(--accent-indigo)'} onMouseLeave=${e => e.target.style.color='var(--text-muted)'}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></button>
                                                </div>
                                            </div>
                                            ${this.scriptState.filename ? html`<p style="font-size:12px;color:var(--text-muted);margin:0">已选择: ${this.scriptState.filename}</p>` : null}
                                            <textarea class="sb-imp-textarea" value=${this.scriptState.scriptText} onInput=${e => { this.scriptState.scriptText = e.target.value; }} rows="8" placeholder="在此粘贴或输入剧本内容..."></textarea>
                                        </div>
                                    ` : html`
                                        <div class="sb-imp-section">
                                            <label>${this.scriptState.level === 'scenes' ? '剧集文本（自动填充，可编辑）' : '场景文本（自动填充，可编辑）'}</label>
                                            <textarea class="sb-imp-textarea" value=${this.scriptState.scriptText} onInput=${e => { this.scriptState.scriptText = e.target.value; }} rows="10" placeholder="文本内容..."></textarea>
                                        </div>
                                    `}
                                    ${this.textModels.length > 1 ? html`
                                        <div class="sb-imp-section">
                                            <label>分析模型</label>
                                            <select class="sb-imp-select" value=${this.scriptState.model} onChange=${e => { this.scriptState.model = e.target.value; }}>
                                                ${this.textModels.map(m => html`<option value=${m} key=${m}>${this.friendlyModelName(m)}</option>`)}
                                            </select>
                                        </div>
                                    ` : null}
                                    ${this.scriptState.error ? html`<p class="sb-imp-error">${this.scriptState.error}</p>` : null}
                                    ${this.scriptState.step === 'analyzing' ? html`
                                        <div class="sb-imp-progress">${this.scriptState.progress}</div>
                                    ` : html`
                                        <button class="sb-imp-primary" title="开始分析剧本" onClick=${this.startScriptAnalysis} disabled=${!this.scriptState.scriptText.trim()}>开始分析</button>
                                    `}
                                ` : null}
                                ${this.scriptState.step === 'preview' ? html`
                                    ${this.scriptState.detailId ? html`
                                        <div class="sb-imp-detail">
                                            <button class="sb-imp-back" title="返回列表" onClick=${() => { this.scriptState.detailId = null; }}>← 返回列表</button>
                                            ${(() => {
                                                const [type, idx] = this.scriptState.detailId.split('-');
                                                const i = parseInt(idx);
                                                if (type === 'ep' && this.scriptState.result?.episodes?.[i]) {
                                                    const ep = this.scriptState.result.episodes[i];
                                                    return html`<h4>${ep.title || '剧集 ' + (i + 1)}</h4>
                                                        ${ep.summary ? html`<p class="sb-imp-detail-label">概要</p><p class="sb-imp-detail-text">${ep.summary}</p>` : null}
                                                        ${ep.tags?.length ? html`<p class="sb-imp-detail-label">标签</p><div>${ep.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}
                                                        <p class="sb-imp-detail-label">原文</p><pre class="sb-imp-detail-pre">${(ep.text || '').substring(0, 2000)}${(ep.text || '').length > 2000 ? '\n...(已截断)' : ''}</pre>`;
                                                }
                                                if (type === 'sc' && this.scriptState.result?.scenes?.[i]) {
                                                    const sc = this.scriptState.result.scenes[i];
                                                    return html`<h4>${sc.title || '场景 ' + (i + 1)}</h4>
                                                        ${sc.summary ? html`<p class="sb-imp-detail-label">概要</p><p class="sb-imp-detail-text">${sc.summary}</p>` : null}
                                                        ${sc.tags?.length ? html`<p class="sb-imp-detail-label">标签</p><div>${sc.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}
                                                        <p class="sb-imp-detail-label">原文</p><pre class="sb-imp-detail-pre">${(sc.text || '').substring(0, 2000)}${(sc.text || '').length > 2000 ? '\n...(已截断)' : ''}</pre>`;
                                                }
                                                if (type === 'sh' && this.scriptState.result?.shots?.[i]) {
                                                    const sh = this.scriptState.result.shots[i];
                                                    return html`<h4>${sh.title || '镜头 ' + (i + 1)}</h4>
                                                        <p class="sb-imp-detail-label">画面描述</p><p class="sb-imp-detail-text">${sh.prompt}</p>
                                                        ${sh.characters?.length ? html`<p class="sb-imp-detail-label">角色</p><div>${sh.characters.map(c => html`<span class="sb-tag" key=${c}>${c}</span>`)}</div>` : null}
                                                        ${sh.props?.length ? html`<p class="sb-imp-detail-label">道具</p><div>${sh.props.map(p => html`<span class="sb-tag" key=${p}>${p}</span>`)}</div>` : null}`;
                                                }
                                                if (type === 'ch' && this.scriptState.result?.characters?.[i]) {
                                                    const c = this.scriptState.result.characters[i];
                                                    return html`<h4>\u{1F464} ${c.name}</h4>
                                                        <p class="sb-imp-detail-label">描述</p><p class="sb-imp-detail-text">${c.description || '无描述'}</p>
                                                        ${c.tags?.length ? html`<p class="sb-imp-detail-label">标签</p><div>${c.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}`;
                                                }
                                                if (type === 'pr' && this.scriptState.result?.props?.[i]) {
                                                    const p = this.scriptState.result.props[i];
                                                    return html`<h4>\u{1F4E6} ${p.name}</h4>
                                                        <p class="sb-imp-detail-label">描述</p><p class="sb-imp-detail-text">${p.description || '无描述'}</p>
                                                        ${p.category ? html`<p class="sb-imp-detail-label">分类</p><p class="sb-imp-detail-text">${p.category}</p>` : null}
                                                        ${p.tags?.length ? html`<p class="sb-imp-detail-label">标签</p><div>${p.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}`;
                                                }
                                                if (type === 'scn' && this.scriptState.result?.scenes?.[i]) {
                                                    const s = this.scriptState.result.scenes[i];
                                                    return html`<h4>\u{1F3DD} ${s.name}</h4>
                                                        <p class="sb-imp-detail-label">描述</p><p class="sb-imp-detail-text">${s.description || '无描述'}</p>
                                                        ${s.category ? html`<p class="sb-imp-detail-label">分类</p><p class="sb-imp-detail-text">${s.category}</p>` : null}
                                                        ${s.tags?.length ? html`<p class="sb-imp-detail-label">标签</p><div>${s.tags.map(t => html`<span class="sb-tag" key=${t}>${t}</span>`)}</div>` : null}`;
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    ` : html`
                                        <div class="sb-imp-preview">
                                            <div class="sb-imp-tree">
                                                <h4>分析结果 (AI分析)</h4>
                                                ${this.scriptState.level === 'episodes' ? html`
                                                    <p class="sb-imp-detail-hint">点击查看详情</p>
                                                    ${(this.scriptState.result?.episodes || []).map((ep, ei) => html`
                                                        <div class="sb-imp-tree-item" key=${ei} onClick=${() => { this.scriptState.detailId = 'ep-' + ei; }}>
                                                            <div class="sb-imp-tree-label ep">\u{1F3AC} ${ep.title || '剧集 ' + (ei + 1)}</div>
                                                            <div class="sb-imp-tree-text">${(ep.summary || '').substring(0, 80)}</div>
                                                        </div>
                                                    `)}
                                                    <h5 style="margin:10px 0 4px;color:var(--accent-indigo)">角色</h5>
                                                    <div class="sb-imp-tags-row">
                                                    ${(this.scriptState.result?.characters || []).map((c, ci) => html`
                                                        <span class="sb-imp-tag" key=${'c'+ci} onClick=${() => { this.scriptState.detailId = 'ch-' + ci; }}>\u{1F464} ${c.name}</span>
                                                    `)}
                                                    ${(this.scriptState.result?.characters || []).length === 0 ? html`<span style="font-size:12px;color:var(--text-secondary)">无角色</span>` : null}
                                                    </div>
                                                    <h5 style="margin:10px 0 4px;color:var(--accent-indigo)">道具</h5>
                                                    <div class="sb-imp-tags-row">
                                                    ${(this.scriptState.result?.props || []).map((p, pi) => html`
                                                        <span class="sb-imp-tag" key=${'p'+pi} onClick=${() => { this.scriptState.detailId = 'pr-' + pi; }}>\u{1F4E6} ${p.name}</span>
                                                    `)}
                                                    ${(this.scriptState.result?.props || []).length === 0 ? html`<span style="font-size:12px;color:var(--text-secondary)">无道具</span>` : null}
                                                    </div>
                                                    <h5 style="margin:10px 0 4px;color:var(--accent-indigo)">场景</h5>
                                                    <div class="sb-imp-tags-row">
                                                    ${(this.scriptState.result?.scenes || []).map((s, si) => html`
                                                        <span class="sb-imp-tag" key=${'scn'+si} onClick=${() => { this.scriptState.detailId = 'scn-' + si; }}>\u{1F3DD} ${s.name}</span>
                                                    `)}
                                                    ${(this.scriptState.result?.scenes || []).length === 0 ? html`<span style="font-size:12px;color:var(--text-secondary)">无场景</span>` : null}
                                                    </div>
                                                ` : null}
                                                ${this.scriptState.level === 'scenes' ? html`
                                                    <p class="sb-imp-detail-hint">点击查看详情</p>
                                                    ${(this.scriptState.result?.scenes || []).map((sc, si) => html`
                                                        <div class="sb-imp-tree-item" key=${si} onClick=${() => { this.scriptState.detailId = 'sc-' + si; }}>
                                                            <div class="sb-imp-tree-label sc">\u{1F3DD} ${sc.title || '场景 ' + (si + 1)}</div>
                                                            <div class="sb-imp-tree-text">${(sc.summary || '').substring(0, 80)}</div>
                                                        </div>
                                                    `)}
                                                ` : null}
                                                ${this.scriptState.level === 'shots' ? html`
                                                    <p class="sb-imp-detail-hint">点击查看详情</p>
                                                    ${(this.scriptState.result?.shots || []).map((sh, shi) => html`
                                                        <div class="sb-imp-tree-item" key=${shi} onClick=${() => { this.scriptState.detailId = 'sh-' + shi; }}>
                                                            <div class="sb-imp-tree-label shot">\u{1F3AC} ${sh.title || '镜头 ' + (shi + 1)}</div>
                                                            <div class="sb-imp-tree-text">${(sh.prompt || '').substring(0, 100)}</div>
                                                            ${(sh.characters?.length || sh.props?.length) ? html`<div class="sb-imp-tree-refs">${(sh.characters || []).map(c => html`<span class="sb-tag" key=${c}>${c}</span>`)}${(sh.props || []).map(p => html`<span class="sb-tag" key=${p}>${p}</span>`)}</div>` : null}
                                                        </div>
                                                    `)}
                                                ` : null}
                                            </div>
                                            ${this.scriptState.level === 'episodes' ? html`
                                                <div class="sb-imp-select-area">
                                                    <div class="sb-imp-select-scroll">
                                                        <h4>角色 (${(this.scriptState.result?.characters || []).length})</h4>
                                                        ${(this.scriptState.result?.characters || []).length ? html`<div class="sb-imp-checks">${(this.scriptState.result.characters || []).map((c, i) => html`
                                                            <label class=${c._imageAsset ? 'sb-imp-check has-img' : 'sb-imp-check'} key=${i}><input type="checkbox" checked=${!!this.scriptState.selectedChars[i]} onChange=${e => { this.scriptState.selectedChars[i] = e.target.checked; }} />${c._imageAsset ? html`<img class="sb-imp-check-thumb" src=${'/workspace/' + c._imageAsset} />` : null}${c.name}</label>
                                                        `)}</div>` : html`<p style="font-size:12px;color:var(--text-secondary)">无角色</p>`}
                                                        <h4 style="margin-top:12px">道具 (${(this.scriptState.result?.props || []).length})</h4>
                                                        ${(this.scriptState.result?.props || []).length ? html`<div class="sb-imp-checks">${(this.scriptState.result?.props || []).map((p, i) => html`
                                                            <label class=${p._imageAsset ? 'sb-imp-check has-img' : 'sb-imp-check'} key=${i}><input type="checkbox" checked=${!!this.scriptState.selectedProps[i]} onChange=${e => { this.scriptState.selectedProps[i] = e.target.checked; }} />${p._imageAsset ? html`<img class="sb-imp-check-thumb" src=${'/workspace/' + p._imageAsset} />` : null}${p.name}</label>
                                                        `)}</div>` : html`<p style="font-size:12px;color:var(--text-secondary)">无道具</p>`}
                                                        <h4 style="margin-top:12px">场景 (${(this.scriptState.result?.scenes || []).length})</h4>
                                                        ${(this.scriptState.result?.scenes || []).length ? html`<div class="sb-imp-checks">${(this.scriptState.result?.scenes || []).map((s, i) => html`
                                                            <label class=${s._imageAsset ? 'sb-imp-check has-img' : 'sb-imp-check'} key=${i}><input type="checkbox" checked=${!!this.scriptState.selectedScenes[i]} onChange=${e => { this.scriptState.selectedScenes[i] = e.target.checked; }} />${s._imageAsset ? html`<img class="sb-imp-check-thumb" src=${'/workspace/' + s._imageAsset} />` : null}${s.name}</label>
                                                        `)}</div>` : html`<p style="font-size:12px;color:var(--text-secondary)">无场景</p>`}
                                                    </div>
                                                    <div class="sb-imp-select-footer">
                                                        <label style="font-size:12px;color:var(--text-muted);font-weight:500">画风</label>
                                                        <select class="sb-lib-style-sel sb-inline-select" value=${this.scriptState.styleIndex} onChange=${e => { this.scriptState.styleIndex = parseInt(e.target.value); }} style="display:block;width:100%;margin-top:4px">
                                                            ${STYLE_PRESETS.map((s, i) => html`<option value=${i} key=${i}>${s.label}</option>`)}
                                                        </select>
                                                        ${this.scriptState.styleIndex === STYLE_PRESETS.length - 1 ? html`<input class="sb-lib-style-custom sb-inline-select" value=${this.scriptState.styleCustom} onInput=${e => { this.scriptState.styleCustom = e.target.value; }} placeholder="输入自定义画风描述..." style="display:block;width:100%;margin-top:6px" />` : null}
                                                        <div class="sb-imp-actions" style="margin-top:10px">
                                                            <button class="sb-imp-btn" title="为选中的角色/道具/场景生成参考图" onClick=${this.generateSelectedImages} disabled=${this.scriptState.generatingImages}>${this.scriptState.generatingImages ? this.scriptState.progress + '（可关闭窗口，后台继续）' : '\u{2728} 生成选中图片'}</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ` : null}
                                        </div>
                                        <div class="sb-imp-actions" style="margin-top:16px">
                                            <button class="sb-imp-btn" title="返回修改剧本" onClick=${() => { this.scriptState.step = 'idle'; }}>返回修改</button>
                                            <button class="sb-imp-primary" title="确认导入到分镜" onClick=${this.confirmImport}>确认导入</button>
                                        </div>
                                    `}
                                ` : null}
                            </div>
                        </div>
                    </div>
                ` : null}
                ${this.screenwriterState.show ? html`
                    <div class="sb-imp-overlay" onClick=${this.closeScreenwriter}>
                        <div class="sb-imp-dialog" onClick=${e => e.stopPropagation()}>
                            <div class="sb-imp-header">
                                <h3>${this.screenwriterState.step === 'preview' ? '剧本创作 — 剧本预览' : '剧本创作'}</h3>
                                <button onClick=${this.closeScreenwriter} class="sb-del-btn" title="关闭">✕</button>
                            </div>
                            <div class="sb-imp-body">
                                ${this.screenwriterState.step === 'chat' ? html`
                                    <div class="sb-assistant-messages" style="min-height:240px;max-height:42vh">
                                        ${this.screenwriterState.messages.length === 0 ? html`<div class="sb-assistant-hint">描述你的故事点子，我会像编剧一样和你一起把它打磨成完整剧本。准备好后点击"生成剧本"。</div>` : null}
                                        ${this.screenwriterState.messages.map((m, i) => html`
                                            <div key=${i} class=${m.role === 'user' ? 'sb-assistant-msg user' : 'sb-assistant-msg bot'}>${m.content}</div>
                                        `)}
                                        ${this.screenwriterState.loading ? html`<div class="sb-assistant-msg bot">思考中...</div>` : null}
                                    </div>
                                    ${this.screenwriterState.ready ? html`<p class="sb-imp-progress">\u{2705} 信息已基本完整，可以点击"生成剧本"了（也可继续补充）。</p>` : null}
                                    ${this.textModels.length > 1 ? html`
                                        <div class="sb-imp-section">
                                            <label>模型</label>
                                            <select class="sb-imp-select" value=${this.screenwriterState.model} onChange=${e => { this.screenwriterState.model = e.target.value; }}>
                                                ${this.textModels.map(m => html`<option value=${m} key=${m}>${this.friendlyModelName(m)}</option>`)}
                                            </select>
                                        </div>
                                    ` : null}
                                    ${this.screenwriterState.error ? html`<p class="sb-imp-error">${this.screenwriterState.error}</p>` : null}
                                    <div style="position:relative">
                                        <textarea class="sb-imp-textarea" rows="3" value=${this.screenwriterState.input} onInput=${e => { this.screenwriterState.input = e.target.value; }} onKeydown=${e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendScreenwriterMessage(); } }} placeholder="描述你的故事或回答问题...（Enter 发送，Shift+Enter 换行）" style="padding-right:48px"></textarea>
                                        <button title="发送" onClick=${this.sendScreenwriterMessage} disabled=${this.screenwriterState.loading || !this.screenwriterState.input.trim()} style="position:absolute;right:6px;bottom:6px;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0;background:var(--accent-indigo);color:#fff;border:none;cursor:pointer;flex-shrink:0;transition:opacity .1s">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                        </button>
                                    </div>
                                    <div class="sb-imp-actions" style="margin-top:12px">
                                        <button class=${this.screenwriterState.ready ? 'sb-imp-primary' : 'sb-imp-btn'} title="AI 生成完整剧本" onClick=${this.generateScreenplay} disabled=${this.screenwriterState.generating}>${this.screenwriterState.generating ? '正在生成剧本…' : '\u{1F3AC} 生成剧本'}</button>
                                    </div>
                                ` : null}
                                ${this.screenwriterState.step === 'preview' ? html`
                                    <div class="sb-imp-section">
                                        <label>生成的剧本（可编辑）</label>
                                        <textarea class="sb-imp-textarea" value=${this.screenwriterState.screenplay} onInput=${e => { this.screenwriterState.screenplay = e.target.value; }} rows="16" placeholder="剧本内容..."></textarea>
                                    </div>
                                    ${this.screenwriterState.error ? html`<p class="sb-imp-error">${this.screenwriterState.error}</p>` : null}
                                    <div class="sb-imp-actions" style="margin-top:12px">
                                        <button class="sb-imp-btn" title="返回对话编辑" onClick=${() => { this.screenwriterState.step = 'chat'; }}>← 返回对话</button>
                                        <button class="sb-imp-btn" title="重新生成剧本" onClick=${this.generateScreenplay} disabled=${this.screenwriterState.generating}>${this.screenwriterState.generating ? '重新生成中…' : '\u{1F501} 重新生成'}</button>
                                        <button class="sb-imp-btn" title="保存剧本到工作空间" onClick=${this.saveScreenplayToWorkspace}>\u{1F4BE} 保存到工作空间</button>
                                        <button class="sb-imp-primary" title="将剧本导入到分镜" onClick=${this.useScreenplayForImport}>用于剧本导入 →</button>
                                    </div>
                                ` : null}
                            </div>
                        </div>
                    </div>
                ` : null}
            </div>
            ${this.mentionState.show ? html`
                <div class="sb-mention-overlay" onClick=${this.hideMentionPopup}>
                    <div class="sb-mention-popup" onClick=${e => e.stopPropagation()}>
                        <div class="sb-mention-popup-header">
                            <h4>插入参考资源</h4>
                            <button class="sb-del-btn" title="关闭" onClick=${this.hideMentionPopup}>✕</button>
                        </div>
                        ${['image', 'video', 'audio'].map(type => {
                            const items = this.mentionState.refs.filter(r => r.type === type);
                            if (!items.length) return null;
                            const labels = { image: '图片', video: '视频', audio: '音频' };
                            const icons = { image: '📷', video: '🎬', audio: '🎵' };
                            return html`<div class="sb-mention-section" key=${type}>
                                <h5>${icons[type]} ${labels[type]}</h5>
                                ${items.map((ref, i) => html`
                                    <div class="sb-mention-item" key=${i} onClick=${() => this.insertMentionRef(ref)}>
                                        ${ref.type === 'image' ? html`<img class="sb-mention-thumb" src=${'/workspace/' + ref.path} />` : html`<span class="sb-mention-thumb-icon">${icons[type]}</span>`}
                                        <div class="sb-mention-item-info">
                                            <span class="sb-mention-item-tag">@${labels[type]}${i + 1}</span>
                                            <span class="sb-mention-item-name">${ref.name}</span>
                                        </div>
                                    </div>
                                `)}
                            </div>`;
                        })}
                    </div>
                </div>
            ` : null}`;
    },
};

let _app = null;
function _loadCSS(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}
function _injectCSS() {
    if (document.getElementById('sb-dark-css')) return;
    // Vue Flow required CSS (panels, controls, viewport positioning)
    _loadCSS('vf-core-css', 'https://cdn.jsdelivr.net/npm/@vue-flow/core@1.41.5/dist/style.css');
    _loadCSS('vf-ctrl-css', 'https://cdn.jsdelivr.net/npm/@vue-flow/controls@1.1.3/dist/style.css');
    // StoryBoard own styles
    _loadCSS('sb-dark-css', '/web/sb-dark.css');
}
function mount(el, appState) {
    if (_app) unmount();
    if (appState && !window.state) window.state = appState;
    _injectCSS();
    _app = createApp(StoryboardApp);
    _app.mount(el);
}
function unmount() { if (_app) { _app.unmount(); _app = null; } }
if (typeof window.__onStoryboardReady === 'function') window.__onStoryboardReady(mount, unmount);
export { mount, unmount };
