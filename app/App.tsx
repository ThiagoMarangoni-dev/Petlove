import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { images } from "./assets";
import {
  API_URL,
  DadosExportados,
  Endereco,
  ErroApi,
  ErroRede,
  Operacao,
  Pedido,
  ProdutoApi,
  api,
  executarOuEnfileirar,
  novoIdLocal,
  reenviarFila,
} from "./api";

type Screen =
  | "home"
  | "cart"
  | "profile"
  | "orders"
  | "favorites"
  | "forgot"
  | "login"
  | "signup"
  | "product"
  | "checkout"
  | "confirmed"
  | "orderDetail"
  | "manage"
  | "productForm"
  | "export";
type Product = {
  id: number;
  category: string;
  name: string;
  price: number;
  rating: string;
  image: string;
  description?: string;
  stock?: number;
};
type SyncStatus = "sincronizando" | "ok" | "offline";
const C = {
  bg: "#fffdf9",
  ink: "#2d2522",
  muted: "#857a75",
  coral: "#ff7c6e",
  pale: "#fff0ee",
  border: "#f3ede9",
  cream: "#fff7f4",
  white: "#ffffff",
};
// Catálogo usado só enquanto a API não responde (primeira abertura sem internet).
const localProducts: Product[] = [
  {
    id: 1,
    category: "Petiscos para cães",
    name: "Biscoitos orgânicos de osso",
    price: 12.99,
    rating: "4.9 (120)",
    image: images.biscuit,
  },
  {
    id: 2,
    category: "Diversão para gatos",
    name: "Varinha com penas",
    price: 8.5,
    rating: "4.8 (85)",
    image: images.wand,
  },
  {
    id: 3,
    category: "Camas e conforto",
    name: "Cama donut marshmallow",
    price: 45,
    rating: "5.0 (210)",
    image: images.bed,
  },
  {
    id: 4,
    category: "Alimentação",
    name: "Comedouro elevado de cerâmica",
    price: 22,
    rating: "4.7 (46)",
    image: images.bowl,
  },
];
const DELIVERY_FEE = 5.9;
const money = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const fromApi = (p: ProdutoApi): Product => ({
  id: p.id,
  category: p.categoria,
  name: p.nome,
  price: p.preco,
  rating: `${p.avaliacao.toFixed(1)} (${p.numAvaliacoes})`,
  image: p.imagem || images.bowl,
  description: p.descricao,
  stock: p.estoque,
});
/** Carrinho sem itens zerados e com chaves numéricas. */
const cleanCart = (c: Record<string | number, number>) =>
  Object.fromEntries(
    Object.entries(c)
      .filter(([, q]) => q > 0)
      .map(([k, q]) => [Number(k), q]),
  ) as Record<number, number>;
const upsert = <T extends { id: number }>(list: T[], news: T[]) => {
  const map = new Map(list.map((x) => [x.id, x]));
  news.forEach((n) => map.set(n.id, n));
  return [...map.values()];
};
const Heading = ({
  children,
  size = 22,
}: {
  children: React.ReactNode;
  size?: number;
}) => <Text style={[s.heading, { fontSize: size }]}>{children}</Text>;
const Button = ({
  children,
  onPress,
  light = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  light?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[s.button, light && s.lightButton, disabled && { opacity: 0.5 }]}
  >
    <Text style={[s.buttonText, light && { color: C.coral }]}>{children}</Text>
  </Pressable>
);
const Panel = ({ children }: { children: React.ReactNode }) => (
  <View style={s.panel}>{children}</View>
);
const Field = ({
  label,
  placeholder,
  secure = false,
  value,
  onChangeText,
  keyboardType,
  error,
}: {
  label: string;
  placeholder: string;
  secure?: boolean;
  value?: string;
  onChangeText?: (t: string) => void;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address";
  error?: string;
}) => (
  <View style={{ gap: 6, marginBottom: 16 }}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      placeholder={placeholder}
      placeholderTextColor={C.muted}
      secureTextEntry={secure}
      style={[s.input, error ? { borderColor: C.coral } : null]}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      accessibilityLabel={label}
    />
    {!!error && <Text style={{ color: C.coral, fontSize: 12 }}>{error}</Text>}
  </View>
);
const emptyForm = { nome: "", categoria: "", preco: "", estoque: "", imagem: "" };

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [history, setHistory] = useState<Screen[]>([]);
  const [products, setProducts] = useState<Product[]>(localProducts);
  const [cart, setCart] = useState<Record<number, number>>({ 1: 2, 2: 1 });
  const [favorites, setFavorites] = useState<number[]>([1, 3]);
  const [selected, setSelected] = useState(1);
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Pedido[]>([]);
  const [order, setOrder] = useState<Pedido | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  // Sincronização
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("sincronizando");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const queue = useRef<Operacao[]>([]);
  const syncMark = useRef<string | undefined>(undefined);
  const savedCart = useRef<string>("");
  const syncing = useRef(false);
  // Checkout (CEP pelos Correios/ViaCEP)
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState<Endereco | null>(null);
  const [cepError, setCepError] = useState("");
  // Gerenciar produtos (CRUD)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Exportação JSON
  const [exported, setExported] = useState<DadosExportados | null>(null);
  const [exporting, setExporting] = useState(false);

  const showNotice = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 4000);
  };
  const setQueue = (q: Operacao[]) => {
    queue.current = q;
    setPending(q.length);
  };

  /** Envia o que ficou pendente e baixa as mudanças do servidor. */
  const synchronize = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setSyncStatus("sincronizando");
    try {
      if (queue.current.length) {
        const r = await reenviarFila(queue.current);
        setQueue(r.restantes);
        if (r.pedidosEnviados.length) {
          const sent = new Set(r.pedidosEnviados.map((x) => x.idLocal));
          setOrders((list) =>
            upsert(
              list.filter((o) => !o.idLocal || !sent.has(o.idLocal) || o.id > 0),
              r.pedidosEnviados.map((x) => x.pedido),
            ),
          );
        }
        r.recusadas.forEach((x) => showNotice(`Não foi possível enviar: ${x.motivo}`));
        if (r.restantes.length) throw new ErroRede("Ainda sem conexão.");
      }
      const data = await api.sincronizar(syncMark.current);
      const fresh = data.produtos.map(fromApi);
      setProducts((list) =>
        (data.completa ? fresh : upsert(list, fresh))
          .filter((p) => !data.produtosRemovidos.includes(p.id))
          .sort((a, b) => a.id - b.id),
      );
      setOrders((list) => {
        const local = list.filter((o) => o.id < 0);
        const base = data.completa ? data.pedidos : upsert(list.filter((o) => o.id > 0), data.pedidos);
        return [...local, ...base.filter((o) => !data.pedidosRemovidos.includes(o.id))].sort(
          (a, b) => b.criadoEm.localeCompare(a.criadoEm),
        );
      });
      if (!queue.current.some((o) => o.tipo === "carrinho")) {
        const serverCart = cleanCart(data.carrinho);
        savedCart.current = JSON.stringify(serverCart);
        setCart(serverCart);
      }
      if (!queue.current.some((o) => o.tipo === "favorito")) setFavorites(data.favoritos);
      syncMark.current = data.servidorEm;
      setSyncedAt(new Date());
      setSyncStatus("ok");
    } catch (erro) {
      setSyncStatus("offline");
      if (!(erro instanceof ErroRede)) showNotice((erro as Error).message);
    } finally {
      syncing.current = false;
    }
  }, []);

  // Sincroniza ao abrir o app e a cada 30 segundos.
  useEffect(() => {
    synchronize();
    const timer = setInterval(synchronize, 30000);
    return () => clearInterval(timer);
  }, [synchronize]);

  // Envia o carrinho ao servidor 600 ms depois da última alteração.
  useEffect(() => {
    const clean = cleanCart(cart);
    const json = JSON.stringify(clean);
    if (!syncMark.current || json === savedCart.current) return;
    const timer = setTimeout(async () => {
      savedCart.current = json;
      try {
        const r = await executarOuEnfileirar(queue.current, { tipo: "carrinho", itens: clean });
        setQueue(r.fila);
        if (r.offline) setSyncStatus("offline");
      } catch (erro) {
        showNotice((erro as Error).message);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [cart]);

  const go = (next: Screen) => {
    setHistory((h) => [...h, screen]);
    setScreen(next);
  };
  const back = () => {
    setScreen(history[history.length - 1] || "home");
    setHistory((h) => h.slice(0, -1));
  };
  const add = (id: number, delta = 1) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  const toggleFavorite = async (id: number) => {
    const marcar = !favorites.includes(id);
    setFavorites((f) => (marcar ? [...f, id] : f.filter((x) => x !== id)));
    try {
      const r = await executarOuEnfileirar(queue.current, { tipo: "favorito", produtoId: id, marcar });
      setQueue(r.fila);
      if (r.offline) setSyncStatus("offline");
    } catch (erro) {
      setFavorites((f) => (marcar ? f.filter((x) => x !== id) : [...f, id]));
      showNotice((erro as Error).message);
    }
  };
  const subtotal = products.reduce((sum, p) => sum + p.price * (cart[p.id] || 0), 0);
  const delivery = subtotal > 0 ? DELIVERY_FEE : 0;
  const items = products.filter((p) => cart[p.id] > 0);
  const formatOrderDate = (date: Date) =>
    date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const formatOrderTime = (date: Date) =>
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const chooseProduct = (id: number) => {
    setSelected(id);
    go("product");
  };
  const current = products.find((p) => p.id === selected) || products[0];

  const lookupCep = async () => {
    setCepError("");
    setAddress(null);
    try {
      setAddress(await api.buscarCep(cep));
    } catch (erro) {
      setCepError(
        erro instanceof ErroRede ? "Sem conexão para consultar o CEP." : (erro as Error).message,
      );
    }
  };

  const confirmOrder = async () => {
    const itens = items.map((p) => ({ produtoId: p.id, quantidade: cart[p.id] }));
    const idLocal = novoIdLocal();
    const cepDigits = cep.replace(/\D/g, "");
    setSending(true);
    try {
      const r = await executarOuEnfileirar(queue.current, {
        tipo: "pedido",
        idLocal,
        itens,
        cep: cepDigits || undefined,
      });
      let saved: Pedido;
      if (!r.offline && r.resultado) {
        saved = r.resultado as Pedido;
      } else {
        // Sem internet: o pedido fica na fila e aparece como "Aguardando envio".
        setQueue(r.fila);
        setSyncStatus("offline");
        saved = {
          id: -Date.now(),
          codigo: "aguardando envio",
          idLocal,
          status: "Aguardando envio",
          cep: cepDigits,
          endereco: address ? `${address.logradouro}, ${address.bairro}` : "",
          cidade: address?.cidade ?? "",
          uf: address?.uf ?? "",
          subtotal,
          entrega: delivery,
          total: subtotal + delivery,
          quantidadeItens: itens.reduce((n, i) => n + i.quantidade, 0),
          itens: items.map((p) => ({
            produtoId: p.id,
            nome: p.name,
            categoria: p.category,
            imagem: p.image,
            precoUnitario: p.price,
            quantidade: cart[p.id],
            totalItem: p.price * cart[p.id],
          })),
          criadoEm: new Date().toISOString(),
        };
      }
      setOrders((list) => [saved, ...list.filter((o) => o.id !== saved.id)]);
      setOrder(saved);
      setSelectedOrderId(saved.id);
      savedCart.current = "{}"; // o servidor já esvazia o carrinho ao gravar o pedido
      setCart({});
      go("confirmed");
    } catch (erro) {
      showNotice((erro as Error).message);
      if (erro instanceof ErroApi && erro.status === 409) synchronize();
    } finally {
      setSending(false);
    }
  };

  const changeOrderStatus = async (id: number, status: string) => {
    try {
      const updated = await api.mudarStatusPedido(id, status);
      setOrders((list) => list.map((o) => (o.id === id ? updated : o)));
      showNotice(`Pedido ${updated.codigo}: ${status}.`);
    } catch (erro) {
      showNotice(erro instanceof ErroRede ? "Sem conexão. Tente de novo." : (erro as Error).message);
    }
  };

  const deleteOrder = async (id: number) => {
    try {
      await api.removerPedido(id);
      setOrders((list) => list.filter((o) => o.id !== id));
      back();
      showNotice("Pedido apagado.");
    } catch (erro) {
      showNotice(erro instanceof ErroRede ? "Sem conexão. Tente de novo." : (erro as Error).message);
    }
  };

  const openForm = (p?: Product) => {
    setEditingId(p?.id ?? null);
    setFormErrors({});
    setForm(
      p
        ? {
            nome: p.name,
            categoria: p.category,
            preco: String(p.price).replace(".", ","),
            estoque: String(p.stock ?? 0),
            imagem: p.image,
          }
        : emptyForm,
    );
    go("productForm");
  };

  const saveProduct = async () => {
    const data = {
      nome: form.nome,
      categoria: form.categoria,
      preco: Number(form.preco.replace(",", ".")) || 0,
      estoque: form.estoque === "" ? 0 : Number(form.estoque),
      imagem: form.imagem,
    };
    try {
      const saved = editingId
        ? await api.atualizarProduto(editingId, data)
        : await api.criarProduto(data);
      setProducts((list) => upsert(list, [fromApi(saved)]).sort((a, b) => a.id - b.id));
      showNotice(editingId ? "Produto atualizado." : "Produto cadastrado.");
      back();
    } catch (erro) {
      if (erro instanceof ErroApi && erro.campos) setFormErrors(erro.campos);
      showNotice(erro instanceof ErroRede ? "Sem conexão: o cadastro precisa de internet." : (erro as Error).message);
    }
  };

  const deleteProduct = async (p: Product) => {
    try {
      await api.removerProduto(p.id);
      setProducts((list) => list.filter((x) => x.id !== p.id));
      setCart((c) => cleanCart({ ...c, [p.id]: 0 }));
      setFavorites((f) => f.filter((x) => x !== p.id));
      showNotice(`"${p.name}" removido do catálogo.`);
    } catch (erro) {
      showNotice(erro instanceof ErroRede ? "Sem conexão. Tente de novo." : (erro as Error).message);
    }
  };

  /** Botão "Gerar dados em JSON": busca os dados na API para o dashboard. */
  const generateJson = async () => {
    setExporting(true);
    try {
      setExported(await api.exportar());
    } catch (erro) {
      showNotice(erro instanceof ErroRede ? "Sem conexão com o servidor." : (erro as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const shareJson = async () => {
    if (!exported) return;
    const json = JSON.stringify(exported, null, 2);
    const fileName = `petlove-dados-${exported.metadados.geradoEm.slice(0, 10)}.json`;
    if (Platform.OS === "web") {
      // No navegador, baixa o arquivo .json.
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // No celular, abre o menu de compartilhar (e-mail, WhatsApp, Drive...).
    await Share.share({ title: fileName, message: json });
  };

  const header = (title: string, right?: React.ReactNode) => (
    <View style={s.header}>
      <Pressable onPress={back} style={s.back} accessibilityLabel="Voltar">
        <Text style={{ color: C.ink, fontSize: 22 }}>‹</Text>
      </Pressable>
      <Heading>{title}</Heading>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  );
  const productCard = (p: Product) => (
    <Pressable key={p.id} style={s.productCard} onPress={() => chooseProduct(p.id)}>
      <Image source={{ uri: p.image }} style={s.productImage} />
      <Text style={s.category}>{p.category}</Text>
      <Text style={s.productName} numberOfLines={1}>
        {p.name}
      </Text>
      <Text style={s.muted}>⭐ {p.rating}</Text>
      <View style={s.rowBetween}>
        <Heading size={18}>{money(p.price)}</Heading>
        <Pressable
          onPress={() => add(p.id)}
          style={s.add}
          accessibilityLabel={`Adicionar ${p.name}`}
        >
          <Text style={{ color: C.white, fontSize: 20 }}>+</Text>
        </Pressable>
      </View>
    </Pressable>
  );
  const cartItem = (p: Product, controls = true) => (
    <Panel key={p.id}>
      <View style={s.cartItem}>
        <Image source={{ uri: p.image }} style={s.thumb} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.label} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={s.muted}>
            {p.id === 1
              ? "Tamanho: Médio | Natural"
              : p.id === 2
                ? "Cor: Coral vibrante"
                : p.category}
          </Text>
          <View style={s.rowBetween}>
            <Text style={[s.label, { fontSize: 16 }]}>{money(p.price)}</Text>
            {controls ? (
              <View style={s.quantity}>
                <Pressable onPress={() => add(p.id, -1)} accessibilityLabel="Diminuir">
                  <Text style={s.qtyAction}>−</Text>
                </Pressable>
                <Text style={s.label}>{cart[p.id]}</Text>
                <Pressable onPress={() => add(p.id)} accessibilityLabel="Aumentar">
                  <Text style={s.qtyAction}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={s.muted}>{cart[p.id]} un.</Text>
            )}
          </View>
        </View>
      </View>
    </Panel>
  );
  const orderItem = (i: Pedido["itens"][number]) => (
    <Panel key={i.produtoId}>
      <View style={s.cartItem}>
        <Image source={{ uri: i.imagem || images.bowl }} style={s.thumb} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={s.label} numberOfLines={1}>
            {i.nome}
          </Text>
          <Text style={s.muted}>
            {i.quantidade} × {money(i.precoUnitario)}
          </Text>
          <Text style={[s.label, { fontSize: 16 }]}>{money(i.totalItem)}</Text>
        </View>
      </View>
    </Panel>
  );
  const summary = (currentSubtotal = subtotal, currentDelivery = delivery) => (
    <Panel>
      <Text style={s.label}>Resumo do pedido</Text>
      <View style={s.summaryLine}>
        <Text style={s.muted}>Subtotal</Text>
        <Text>{money(currentSubtotal)}</Text>
      </View>
      <View style={s.summaryLine}>
        <Text style={s.muted}>Entrega</Text>
        <Text>{money(currentDelivery)}</Text>
      </View>
      <View style={s.separator} />
      <View style={s.rowBetween}>
        <Heading size={18}>Total</Heading>
        <Heading size={20}>{money(currentSubtotal + currentDelivery)}</Heading>
      </View>
    </Panel>
  );
  const menu = (label: string, onPress: () => void, icon: string) => (
    <Pressable onPress={onPress} style={s.menu}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={[s.label, { flex: 1 }]}>{label}</Text>
      <Text style={s.muted}>›</Text>
    </Pressable>
  );
  const statusColor = (status: string) =>
    status === "Entregue" ? "#19a86d" : status === "Cancelado" ? C.muted : C.coral;
  const syncLabel =
    syncStatus === "sincronizando"
      ? "Sincronizando…"
      : syncStatus === "offline"
        ? `Sem conexão${pending ? ` · ${pending} alteração(ões) aguardando envio` : ""}`
        : `Sincronizado às ${syncedAt ? formatOrderTime(syncedAt) : "--:--"}`;

  const content = () => {
    switch (screen) {
      case "home":
        return (
          <>
            <View style={s.delivery}>
              <Image source={{ uri: images.avatar }} style={s.avatar} />
              <View>
                <Text style={s.muted}>Entregando em</Text>
                <Text style={s.label}>
                  {address ? `${address.bairro}, ${address.cidade}` : "Condomínio Patinhas Felizes"}⌄
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              <View
                style={[s.syncDot, { backgroundColor: syncStatus === "offline" ? C.muted : "#19a86d" }]}
                accessibilityLabel={syncLabel}
              />
            </View>
            <View style={s.section}>
              <Heading size={28}>Olá, Sarah! 👋</Heading>
              <Text style={s.muted}>Vamos encontrar algo delicioso para o Buddy hoje</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="🔍  Buscar petiscos, brinquedos..."
                placeholderTextColor={C.muted}
                style={s.input}
                accessibilityLabel="Buscar produtos"
              />
            </View>
            <View style={s.banner}>
              <View style={{ flex: 1, padding: 18, justifyContent: "space-between" }}>
                <View>
                  <Text style={s.pill}>OFERTA DA SEMANA</Text>
                  <Heading size={20}>Patinhas saudáveis, corações felizes</Heading>
                </View>
                <Text style={[s.label, { color: C.coral }]}>
                  Ganhe 20% OFF em petiscos premium ➔
                </Text>
              </View>
              <Image source={{ uri: images.banner }} style={{ width: 130, height: 150 }} />
            </View>
            <View style={s.section}>
              <Heading size={18}>Compre por pet</Heading>
              <View style={s.categories}>
                {[
                  ["🐶", "Cães"],
                  ["🐱", "Gatos"],
                  ["🐦", "Aves"],
                  ["🐟", "Peixes"],
                  ["🛍️", "Acessórios"],
                ].map(([icon, name]) => (
                  <View key={name} style={{ alignItems: "center", gap: 8 }}>
                    <Text style={s.categoryCircle}>{icon}</Text>
                    <Text style={s.label}>{name}</Text>
                  </View>
                ))}
              </View>
              <View style={s.rowBetween}>
                <Heading size={18}>Petiscos e brinquedos populares</Heading>
                <Text style={{ color: C.coral }}>Ver tudo</Text>
              </View>
              <View style={s.grid}>
                {products
                  .filter((p) =>
                    `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map(productCard)}
              </View>
            </View>
          </>
        );
      case "cart":
        return (
          <>
            {header(
              "Meu carrinho",
              <Pressable onPress={() => setCart({})}>
                <Text style={{ color: C.coral, fontWeight: "700" }}>Limpar tudo</Text>
              </Pressable>,
            )}
            <View style={s.section}>
              {items.length ? (
                <>
                  {items.map((p) => cartItem(p))}
                  {summary()}
                  <Button onPress={() => go("checkout")}>Continuar para pagamento →</Button>
                </>
              ) : (
                <Panel>
                  <Text style={s.muted}>Seu carrinho está vazio.</Text>
                  <Button onPress={() => go("home")}>Explorar produtos</Button>
                </Panel>
              )}
            </View>
          </>
        );
      case "profile":
        return (
          <>
            {header("Meu perfil")}
            <View style={s.section}>
              <Panel>
                <View style={s.cartItem}>
                  <Image source={{ uri: images.avatar }} style={s.avatar} />
                  <View>
                    <Heading size={20}>Sarah Santos</Heading>
                    <Text style={s.muted}>sarah.santos@gmail.com</Text>
                  </View>
                </View>
              </Panel>
              <Panel>
                <View style={s.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Sincronização com o servidor</Text>
                    <Text style={s.muted} testID="sync-status">
                      {syncLabel}
                    </Text>
                  </View>
                  {syncStatus === "sincronizando" ? (
                    <ActivityIndicator color={C.coral} />
                  ) : (
                    <Pressable onPress={synchronize} style={s.smallButton}>
                      <Text style={s.smallButtonText}>Sincronizar</Text>
                    </Pressable>
                  )}
                </View>
              </Panel>
              <Panel>
                {menu("Meus pedidos", () => go("orders"), "📦")}
                {menu("Meus favoritos", () => go("favorites"), "♡")}
                {menu("Meus dados", () => go("signup"), "👤")}
                {menu("Gerenciar produtos", () => go("manage"), "🛠️")}
                {menu(
                  "Gerar dados em JSON",
                  () => {
                    go("export");
                    generateJson();
                  },
                  "📊",
                )}
              </Panel>
              <Button light onPress={() => go("login")}>
                Sair da conta
              </Button>
            </View>
          </>
        );
      case "orders":
        return (
          <>
            {header("Meus pedidos")}
            <View style={s.section}>
              <Heading size={18}>Acompanhe suas compras</Heading>
              {orders.length === 0 && (
                <Panel>
                  <Text style={s.muted}>
                    {syncStatus === "offline"
                      ? "Sem conexão com o servidor. Seus pedidos aparecem aqui ao sincronizar."
                      : "Você ainda não fez nenhum pedido."}
                  </Text>
                </Panel>
              )}
              {orders.slice(0, 30).map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    setSelectedOrderId(o.id);
                    go("orderDetail");
                  }}
                >
                  <Panel>
                    <View style={s.rowBetween}>
                      <Text style={s.label}>Pedido #{o.codigo}</Text>
                      <Text style={{ color: statusColor(o.status) }}>{o.status}</Text>
                    </View>
                    <Text style={s.muted}>{formatOrderDate(new Date(o.criadoEm))}</Text>
                    <Text style={s.label}>
                      {o.quantidadeItens} {o.quantidadeItens === 1 ? "item" : "itens"} ·{" "}
                      {money(o.total)}
                    </Text>
                    <Text style={{ color: C.coral }}>Ver detalhes →</Text>
                  </Panel>
                </Pressable>
              ))}
            </View>
          </>
        );
      case "favorites":
        return (
          <>
            {header("Favoritos")}
            <View style={s.section}>
              <Heading size={18}>Produtos que você ama ♡</Heading>
              <View style={s.grid}>
                {products.filter((p) => favorites.includes(p.id)).map(productCard)}
              </View>
            </View>
          </>
        );
      case "product":
        return (
          <>
            {header("Detalhes do produto")}
            <View style={s.section}>
              <View style={s.heroWrap}>
                <Image
                  source={{ uri: current.id === 1 ? images.detail : current.image }}
                  style={s.hero}
                />
                <Pressable
                  style={s.fav}
                  onPress={() => toggleFavorite(current.id)}
                  accessibilityLabel="Favoritar"
                >
                  <Text style={{ color: C.coral, fontSize: 22 }}>
                    {favorites.includes(current.id) ? "♥" : "♡"}
                  </Text>
                </Pressable>
              </View>
              <Text style={[s.category, { color: C.coral }]}>{current.category.toUpperCase()}</Text>
              <Heading size={24}>{current.name}</Heading>
              <Text style={s.muted}>⭐ {current.rating} avaliações de tutores</Text>
              <Heading size={28}>{money(current.price)}</Heading>
              <Text style={s.muted}>
                {current.description ||
                  "Feitos para trazer mais conforto e alegria para seu pet. Produto selecionado com carinho para a rotina do seu melhor amigo."}
              </Text>
              {current.stock !== undefined && (
                <Text style={s.muted}>
                  {current.stock > 0 ? `${current.stock} em estoque` : "Esgotado"}
                </Text>
              )}
              <Text style={s.label}>Tamanho do Pacote</Text>
              <View style={s.row}>
                <Text style={s.option}>Médio (250g)</Text>
                <Text
                  style={[
                    s.option,
                    { backgroundColor: C.white, borderColor: C.border, color: C.ink },
                  ]}
                >
                  Grande (500g)
                </Text>
              </View>
              <Button
                disabled={current.stock === 0}
                onPress={() => {
                  add(current.id);
                  go("cart");
                }}
              >
                Adicionar ao carrinho
              </Button>
            </View>
          </>
        );
      case "checkout":
        return (
          <>
            {header("Revisar pedido")}
            <View style={s.section}>
              <Heading size={18}>Endereço de entrega</Heading>
              <Panel>
                <View style={[s.row, { alignItems: "flex-end" }]}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="CEP"
                      placeholder="00000-000"
                      value={cep}
                      onChangeText={setCep}
                      keyboardType="numeric"
                      error={cepError}
                    />
                  </View>
                  <Pressable onPress={lookupCep} style={[s.smallButton, { marginBottom: 20 }]}>
                    <Text style={s.smallButtonText}>Buscar</Text>
                  </Pressable>
                </View>
                {address && (
                  <Text style={s.label}>
                    📍 {address.logradouro}, {address.bairro} · {address.cidade}/{address.uf}
                  </Text>
                )}
                <Text style={s.muted}>Endereço consultado na base dos Correios (ViaCEP).</Text>
              </Panel>
              <Heading size={18}>Itens do pedido</Heading>
              {items.map((p) => cartItem(p, false))}
              {summary()}
              <Button disabled={sending || items.length === 0} onPress={confirmOrder}>
                {sending ? "Enviando…" : "Confirmar pedido"}
              </Button>
            </View>
          </>
        );
      case "confirmed": {
        if (!order) return null;
        const createdAt = new Date(order.criadoEm);
        const estimatedText = formatOrderTime(new Date(createdAt.getTime() + 3 * 60 * 60 * 1000));
        return (
          <View style={s.confirmedScreen}>
            <View style={s.successBadge}>
              <Text style={s.successBadgeText}>✓</Text>
            </View>
            <Heading size={38}>Pedido confirmado!</Heading>
            <Text style={s.confirmedSubtitle}>
              {order.id > 0
                ? "Obrigado! O seu pedido já está sendo preparado com muito carinho."
                : "Você está sem internet. O pedido foi guardado e será enviado assim que a conexão voltar."}
            </Text>
            <View style={s.confirmedSummary}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Identificação do pedido</Text>
                <Text style={s.summaryValue}>#{order.codigo}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Data de faturamento</Text>
                <Text style={s.summaryValue}>Hoje às {formatOrderTime(createdAt)}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Previsão de entrega</Text>
                <Text style={[s.summaryValue, s.summaryValueGreen]}>Hoje até às {estimatedText}</Text>
              </View>
              <View style={[s.summaryRow, s.summaryRowTotal]}>
                <Text style={s.summaryLabel}>Total pago</Text>
                <Text style={s.totalPaid}>{money(order.total)}</Text>
              </View>
            </View>
            <View style={s.deliveryBanner}>
              <View style={s.deliveryIconWrap}>
                <Text style={s.deliveryIcon}>🚚</Text>
              </View>
              <Text style={s.deliveryText}>Nosso entregador de confiança já está a caminho!</Text>
            </View>
            <Pressable style={s.primaryAction} onPress={() => go("orders")}>
              <Text style={s.primaryActionText}>Ir para Meus Pedidos</Text>
              <Text style={s.primaryActionArrow}>→</Text>
            </Pressable>
            <Pressable style={s.secondaryAction} onPress={() => go("home")}>
              <Text style={s.secondaryActionText}>Voltar para a página inicial</Text>
            </Pressable>
          </View>
        );
      }
      case "orderDetail": {
        const detail = orders.find((o) => o.id === selectedOrderId) ?? order;
        if (!detail) return header("Pedido não encontrado");
        return (
          <>
            {header("Detalhes do pedido")}
            <View style={s.section}>
              <View style={s.rowBetween}>
                <Heading size={22}>Pedido #{detail.codigo}</Heading>
                <Text style={{ color: statusColor(detail.status), fontWeight: "700" }}>
                  {detail.status}
                </Text>
              </View>
              <Text style={s.muted}>Realizado em {formatOrderDate(new Date(detail.criadoEm))}</Text>
              {!!detail.cidade && (
                <Text style={s.muted}>
                  📍 {detail.endereco} · {detail.cidade}/{detail.uf}
                </Text>
              )}
              {summary(detail.subtotal, detail.entrega)}
              <Heading size={18}>Itens do pedido</Heading>
              {detail.itens.map(orderItem)}
              {detail.id > 0 && ["Confirmado", "Em preparo"].includes(detail.status) && (
                <Button light onPress={() => changeOrderStatus(detail.id, "Cancelado")}>
                  Cancelar pedido
                </Button>
              )}
              {detail.id > 0 && ["Cancelado", "Entregue"].includes(detail.status) && (
                <Button light onPress={() => deleteOrder(detail.id)}>
                  Apagar do histórico
                </Button>
              )}
              <Panel>
                <Text style={s.label}>Precisa de ajuda com o pedido?</Text>
                <Text style={s.muted}>Fale com o suporte no chat online 24h</Text>
              </Panel>
            </View>
          </>
        );
      }
      case "manage":
        return (
          <>
            {header(
              "Produtos",
              <Pressable onPress={() => openForm()} style={s.smallButton}>
                <Text style={s.smallButtonText}>+ Novo</Text>
              </Pressable>,
            )}
            <View style={s.section}>
              <Text style={s.muted}>Cadastro do catálogo (dados gravados no servidor).</Text>
              {products.map((p) => (
                <Panel key={p.id}>
                  <View style={s.cartItem}>
                    <Image source={{ uri: p.image }} style={[s.thumb, { width: 56, height: 56 }]} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.label} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={s.muted}>
                        {money(p.price)} · {p.stock ?? "?"} em estoque
                      </Text>
                    </View>
                  </View>
                  <View style={[s.row, { justifyContent: "flex-end" }]}>
                    <Pressable onPress={() => openForm(p)} style={s.smallButton}>
                      <Text style={s.smallButtonText}>Editar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => deleteProduct(p)}
                      style={[s.smallButton, { backgroundColor: C.white, borderWidth: 1, borderColor: C.border }]}
                    >
                      <Text style={[s.smallButtonText, { color: C.muted }]}>Excluir</Text>
                    </Pressable>
                  </View>
                </Panel>
              ))}
            </View>
          </>
        );
      case "productForm":
        return (
          <>
            {header(editingId ? "Editar produto" : "Novo produto")}
            <View style={s.section}>
              <Field
                label="Nome"
                placeholder="Ex.: Bolinha de borracha"
                value={form.nome}
                onChangeText={(t) => setForm({ ...form, nome: t })}
                error={formErrors.nome}
              />
              <Field
                label="Categoria"
                placeholder="Ex.: Diversão para cães"
                value={form.categoria}
                onChangeText={(t) => setForm({ ...form, categoria: t })}
                error={formErrors.categoria}
              />
              <Field
                label="Preço (R$)"
                placeholder="0,00"
                value={form.preco}
                onChangeText={(t) => setForm({ ...form, preco: t })}
                keyboardType="decimal-pad"
                error={formErrors.preco}
              />
              <Field
                label="Estoque"
                placeholder="0"
                value={form.estoque}
                onChangeText={(t) => setForm({ ...form, estoque: t.replace(/\D/g, "") })}
                keyboardType="numeric"
                error={formErrors.estoque}
              />
              <Field
                label="URL da imagem"
                placeholder="https://..."
                value={form.imagem}
                onChangeText={(t) => setForm({ ...form, imagem: t })}
                error={formErrors.imagem}
              />
              <Button onPress={saveProduct}>{editingId ? "Salvar alterações" : "Cadastrar produto"}</Button>
            </View>
          </>
        );
      case "export":
        return (
          <>
            {header("Dados em JSON")}
            <View style={s.section}>
              <Text style={s.muted}>
                Gera um arquivo .json com produtos, pedidos e itens vendidos, usado no dashboard de
                Análise de Dados e Estatística.
              </Text>
              {exporting && <ActivityIndicator color={C.coral} />}
              {exported && (
                <>
                  <View style={s.grid}>
                    {(
                      [
                        ["Pedidos", String(exported.resumo.totalPedidos)],
                        ["Faturamento", money(exported.resumo.faturamento)],
                        ["Ticket médio", money(exported.resumo.ticketMedio)],
                        ["Itens vendidos", String(exported.resumo.itensVendidos)],
                      ] as const
                    ).map(([label, value]) => (
                      <View key={label} style={s.statCard}>
                        <Text style={s.muted}>{label}</Text>
                        <Heading size={20}>{value}</Heading>
                      </View>
                    ))}
                  </View>
                  <Panel>
                    <Text style={s.label}>Prévia do arquivo</Text>
                    <Text style={s.mono} numberOfLines={14}>
                      {JSON.stringify(exported, null, 2).slice(0, 700)}
                    </Text>
                  </Panel>
                  <Button onPress={shareJson}>
                    {Platform.OS === "web" ? "Baixar arquivo JSON" : "Compartilhar arquivo JSON"}
                  </Button>
                </>
              )}
              <Button light onPress={generateJson} disabled={exporting}>
                Gerar novamente
              </Button>
              <Text style={[s.muted, { fontSize: 11 }]}>Servidor: {API_URL}</Text>
            </View>
          </>
        );
      case "login":
        return (
          <>
            {header("Entrar")}
            <View style={[s.section, { paddingTop: 40 }]}>
              <Text style={{ fontSize: 40 }}>🐾</Text>
              <Heading size={28}>Bem-vinda de volta!</Heading>
              <Text style={s.muted}>Entre na sua conta para cuidar do seu pet.</Text>
              <Field label="E-mail" placeholder="seuemail@exemplo.com" />
              <Field label="Senha" placeholder="Digite sua senha" secure />
              <Pressable onPress={() => go("forgot")}>
                <Text style={{ color: C.coral, textAlign: "right" }}>Esqueceu a senha?</Text>
              </Pressable>
              <Button onPress={() => go("home")}>Entrar</Button>
              <Pressable onPress={() => go("signup")}>
                <Text style={s.center}>
                  Não tem uma conta? <Text style={{ color: C.coral }}>Criar conta</Text>
                </Text>
              </Pressable>
            </View>
          </>
        );
      case "signup":
        return (
          <>
            {header("Criar conta")}
            <View style={s.section}>
              <Heading size={26}>Vamos começar? 🐾</Heading>
              <Text style={s.muted}>Crie sua conta e encontre tudo para o seu pet.</Text>
              <Field label="Nome completo" placeholder="Seu nome" />
              <Field label="E-mail" placeholder="seuemail@exemplo.com" />
              <Field label="Telefone" placeholder="(11) 99999-9999" />
              <Field label="Sua Senha" placeholder="Insira uma senha segura" secure />
              <Field label="Confirmar Senha" placeholder="Repita a senha digitada" secure />
              <Text style={s.muted}>
                ☑ Eu aceito as políticas de Privacidade e os Termos de Serviço da Petlove.
              </Text>
              <Button onPress={() => go("home")}>Criar minha conta</Button>
              <Pressable onPress={() => go("login")}>
                <Text style={s.center}>
                  Já possui conta? <Text style={{ color: C.coral }}>Entrar</Text>
                </Text>
              </Pressable>
            </View>
          </>
        );
      case "forgot":
        return (
          <>
            {header("Esqueci a senha")}
            <View style={[s.section, { paddingTop: 60 }]}>
              <Text style={{ fontSize: 48 }}>🔒</Text>
              <Heading size={26}>Recuperar senha</Heading>
              <Text style={s.muted}>
                Informe seu e-mail para receber as instruções de recuperação.
              </Text>
              <Field label="E-mail" placeholder="seuemail@exemplo.com" />
              <Button onPress={() => go("login")}>Enviar instruções</Button>
            </View>
          </>
        );
    }
  };
  const showTabs = ["home", "cart", "profile", "product", "orders", "favorites", "manage"].includes(
    screen,
  );
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      {!!notice && (
        <View style={s.notice}>
          <Text style={s.noticeText}>{notice}</Text>
        </View>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: showTabs ? 110 : 36 }}
      >
        {content()}
      </ScrollView>
      {showTabs && (
        <View style={s.tabs}>
          {(
            [
              ["⌂", "Início", "home"],
              ["🛒", "Carrinho", "cart"],
              ["♙", "Perfil", "profile"],
            ] as const
          ).map(([icon, label, target]) => (
            <Pressable
              key={target}
              onPress={() => go(target)}
              style={[s.tab, screen === target && s.tabActive]}
              accessibilityLabel={label}
            >
              <Text style={{ color: screen === target ? C.coral : C.muted, fontSize: 22 }}>
                {icon}
              </Text>
              {screen === target && (
                <Text style={{ color: C.coral, fontWeight: "700" }}>{label}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 16,
  },
  heading: { color: C.ink, fontWeight: "800", letterSpacing: -0.5 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 20 },
  label: { color: C.ink, fontSize: 14, fontWeight: "700" },
  category: { color: C.muted, fontSize: 11, marginTop: 8 },
  productName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "700",
    marginVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
  },
  header: {
    paddingHorizontal: 16,
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  delivery: {
    height: 62,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  input: {
    height: 48,
    borderRadius: 24,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    color: C.ink,
    fontSize: 14,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    height: 150,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: C.cream,
    borderWidth: 1,
    borderColor: C.pale,
  },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: C.coral,
    color: C.white,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
  },
  categories: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  categoryCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.pale,
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
    fontSize: 26,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  productCard: {
    width: "48%",
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 12,
    gap: 2,
  },
  productImage: { width: "100%", height: 130, borderRadius: 12 },
  add: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: C.coral,
    justifyContent: "center",
    alignItems: "center",
  },
  panel: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  cartItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 80, height: 80, borderRadius: 12 },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.cream,
    borderRadius: 14,
    paddingHorizontal: 8,
  },
  qtyAction: { color: C.coral, fontSize: 20, fontWeight: "700" },
  separator: { height: 1, backgroundColor: C.border },
  summaryLine: { flexDirection: "row", justifyContent: "space-between" },
  button: {
    minHeight: 52,
    backgroundColor: C.coral,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  lightButton: { backgroundColor: C.pale },
  buttonText: { color: C.white, fontSize: 15, fontWeight: "800" },
  confirmedScreen: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 18,
    alignItems: "center",
    backgroundColor: C.bg,
  },
  successBadge: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#dff4ea",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 22,
  },
  successBadgeText: {
    color: "#3bb26b",
    fontSize: 52,
    fontWeight: "800",
    lineHeight: 52,
  },
  confirmedSubtitle: {
    marginTop: 6,
    marginBottom: 20,
    textAlign: "center",
    fontSize: 18,
    color: C.ink,
    lineHeight: 28,
    fontWeight: "400",
  },
  confirmedSummary: {
    width: "100%",
    backgroundColor: "#f6f1ef",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f0e7e5",
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  summaryRowTotal: {
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 8,
  },
  summaryLabel: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  summaryValue: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  summaryValueGreen: {
    color: "#19a86d",
  },
  totalPaid: {
    color: "#f57a6a",
    fontSize: 18,
    fontWeight: "800",
  },
  deliveryBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fbe7e3",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  deliveryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#f6d3cc",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deliveryIcon: {
    fontSize: 20,
  },
  deliveryText: {
    flex: 1,
    color: "#d76b5e",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  primaryAction: {
    width: "100%",
    backgroundColor: "#f68d7b",
    borderRadius: 28,
    minHeight: 60,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  primaryActionText: {
    color: C.white,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  primaryActionArrow: {
    color: C.white,
    fontSize: 24,
    fontWeight: "700",
    marginLeft: 8,
  },
  secondaryAction: {
    width: "100%",
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#f2c9c2",
    backgroundColor: "transparent",
  },
  secondaryActionText: {
    color: "#ef826f",
    fontSize: 19,
    fontWeight: "700",
  },
  tabs: {
    position: "absolute",
    bottom: 12,
    left: 16,
    right: 16,
    height: 68,
    backgroundColor: C.white,
    borderRadius: 34,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 4,
  },
  tab: {
    flex: 1,
    height: 44,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tabActive: { backgroundColor: C.pale },
  menu: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  heroWrap: {
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 12,
  },
  hero: { width: "100%", height: 214, borderRadius: 16 },
  fav: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: C.white,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.coral,
    backgroundColor: C.pale,
    color: C.coral,
    fontWeight: "700",
  },
  center: { color: C.muted, textAlign: "center", padding: 12 },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  smallButton: {
    backgroundColor: C.coral,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: { color: C.white, fontWeight: "700", fontSize: 13 },
  statCard: {
    width: "48%",
    backgroundColor: C.white,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 4,
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    color: C.ink,
  },
  notice: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 10,
    backgroundColor: C.ink,
    borderRadius: 16,
    padding: 12,
  },
  noticeText: { color: C.white, fontWeight: "600", textAlign: "center" },
});
