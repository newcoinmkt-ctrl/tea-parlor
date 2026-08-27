export const CHAIN_CENTER_POLICY = 'internal_mock_only_no_chain_transaction';

const DEFAULT_CHAIN_CENTER = Object.freeze({
  wallet: {
    bound: false,
    label: '未绑定',
    simulatedSignature: null,
  },
  badges: ['测试网', '规划中', '合规后开放'],
});

export function normalizeChainCenterState(saved = {}) {
  return {
    ...DEFAULT_CHAIN_CENTER,
    ...saved,
    wallet: {
      ...DEFAULT_CHAIN_CENTER.wallet,
      ...(saved.wallet || {}),
      bound: Boolean(saved.wallet?.bound),
    },
  };
}

export function createChainCenterController({
  getAppState,
  getProfile,
  getSeasonPoints,
  fetchChainAssets,
  saveState,
  setStatus,
  format,
  formatCrypto,
  escapeHtml,
}) {
  function getChainCenterState() {
    const state = getAppState();
    state.chainCenter = normalizeChainCenterState(state.chainCenter);
    return state.chainCenter;
  }

  function buildLocalChainAssets() {
    const state = getAppState();
    const chain = getChainCenterState();
    return {
      ok: true,
      policy: CHAIN_CENTER_POLICY,
      network: {
        name: 'Tea Testnet',
        labels: ['测试网', '规划中', '合规后开放'],
        externalTransactions: false,
      },
      wallet: {
        bound: chain.wallet.bound,
        label: chain.wallet.bound ? '模拟签名已开启' : '未绑定',
        simulatedSignature: chain.wallet.simulatedSignature || null,
      },
      assets: [
        { id: 'shadow-points', label: '影子积分', amount: state.ingots, unit: '金币', tag: '内部账本' },
        { id: 'season-points', label: '赛季积分', amount: getSeasonPoints(), unit: 'SP', tag: '测试区' },
        { id: 'skin-shards', label: '皮肤碎片', amount: 36, unit: '片', tag: '活动' },
        { id: 'memorial-assets', label: '链游纪念资产', amount: 3, unit: '件', tag: '展示' },
      ],
      collectibles: [
        { id: 'nft-skin-table-gold', title: '赛季金桌布', type: 'NFT 皮肤占位', rarity: '稀有', status: '不可交易', source: '赛季活动' },
        { id: 'nft-skin-card-chain', title: '链游纪念牌背', type: 'NFT 皮肤占位', rarity: '史诗', status: '展示中', source: '链游纪念' },
        { id: 'nft-frame-partner', title: '联名头像框', type: '广告联名', rarity: '史诗', status: '待开放', source: '联名配置' },
      ],
    };
  }

  async function renderChainCenter() {
    const local = buildLocalChainAssets();
    let data = local;
    try {
      const remote = await fetchChainAssets(getProfile().playerId || '830126');
      if (remote?.ok) data = {
        ...local,
        ...remote,
        wallet: { ...local.wallet, ...(remote.wallet || {}) },
      };
    } catch (_) {
      data = local;
    }
    const chain = getChainCenterState();
    data.wallet = {
      ...data.wallet,
      bound: chain.wallet.bound,
      label: chain.wallet.bound ? '模拟签名已开启' : '未绑定',
      simulatedSignature: chain.wallet.simulatedSignature || data.wallet?.simulatedSignature || null,
    };
    renderChainWallet(data);
    renderChainAssets(data.assets || local.assets);
    renderChainCollectibles(data.collectibles || local.collectibles);
  }

  function renderChainWallet(data) {
    const title = document.getElementById('chainWalletTitle');
    const meta = document.getElementById('chainWalletMeta');
    const btn = document.getElementById('chainBindButton');
    const wallet = data.wallet || {};
    if (title) title.textContent = wallet.bound ? '模拟签名已开启' : '模拟签名未开启';
    if (meta) {
      meta.textContent = wallet.bound
        ? `状态：${wallet.label || '已绑定'} · ${wallet.simulatedSignature || 'local-signature'}`
        : '点击按钮仅写入本地模拟状态，不调用真实网络。';
    }
    if (btn) btn.textContent = wallet.bound ? '刷新模拟签名' : '模拟绑定钱包';
  }

  function renderChainAssets(assets = []) {
    const grid = document.getElementById('chainAssetGrid');
    if (!grid) return;
    grid.innerHTML = assets.map((asset) => `
      <article class="chain-asset-card">
        <span>${escapeHtml(asset.tag || '内部')}</span>
        <strong>${escapeHtml(asset.label)}</strong>
        <b>${escapeHtml(formatChainAmount(asset.amount))}</b>
        <em>${escapeHtml(asset.unit || '')}</em>
      </article>
    `).join('');
  }

  function renderChainCollectibles(items = []) {
    const grid = document.getElementById('chainCollectibleGrid');
    if (!grid) return;
    grid.innerHTML = items.map((item) => `
      <article class="chain-nft-card">
        <div class="chain-nft-art" aria-hidden="true"><i></i></div>
        <span>${escapeHtml(item.type || '皮肤占位')}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.rarity || '普通')} · ${escapeHtml(item.source || '内部配置')}</p>
        <em>${escapeHtml(item.status || '不可交易')}</em>
      </article>
    `).join('');
  }

  function bindChainCenterUi() {
    document.getElementById('chainBindButton')?.addEventListener('click', () => {
      const chain = getChainCenterState();
      const stamp = Date.now().toString(36).toUpperCase();
      chain.wallet = {
        bound: true,
        label: '模拟签名已开启',
        simulatedSignature: `SIM-${stamp}`,
      };
      saveState();
      renderChainCenter();
      setStatus?.('链游中心：模拟签名状态已更新');
    });
  }

  function formatChainAmount(value) {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? format(value) : formatCrypto(value);
    }
    return String(value ?? '0');
  }

  return {
    bindChainCenterUi,
    renderChainCenter,
  };
}
