import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Check,
  Edit3,
  FileText,
  Globe,
  GraduationCap,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Newspaper,
  Paperclip,
  Phone,
  PlusCircle,
  Search,
  Send,
  Share2,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X
} from "lucide-react";
import toast from "react-hot-toast";
import PageBanner from "../components/PageBanner";
import HeartbeatLoader from "../components/HeartbeatLoader";
import { AppButton, IconButton, PageToolbar, SearchBox } from "../components/VetLearnUI";
import { supabase } from "../supabaseClient";

const postShareTypes = [
  { value: "", label: "General post" },
  { value: "caselog", label: "Case log" },
  { value: "drug", label: "Drug" },
  { value: "protocol", label: "Protocol" },
  { value: "cpd", label: "CPD item" },
  { value: "resource", label: "Other resource" }
];

const defaultPostForm = {
  body: "",
  shared_type: "",
  shared_title: "",
  shared_url: "",
  shared_payload: null
};

export default function Network({ user, darkMode = false }) {
  const [activeTab, setActiveTab] = useState("posts");
  const [connections, setConnections] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [sentRequestDetails, setSentRequestDetails] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [posts, setPosts] = useState([]);
  const [postSearchQuery, setPostSearchQuery] = useState("");
  const [postForm, setPostForm] = useState(defaultPostForm);
  const [editForm, setEditForm] = useState(defaultPostForm);
  const [editingPostId, setEditingPostId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareableCases, setShareableCases] = useState([]);
  const [shareableProtocols, setShareableProtocols] = useState([]);
  const [sharedViewer, setSharedViewer] = useState(null);
  const [postsAvailable, setPostsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [postLoading, setPostLoading] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [postUpdating, setPostUpdating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedColleague, setSelectedColleague] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"}`;

  useEffect(() => {
    if (!user) return;
    loadNetworkData();
    loadPosts();
    loadShareableItems();

    const channel = supabase
      .channel(`network-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => {
        loadNetworkData();
        window.dispatchEvent(new Event("networkUpdated"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "network_posts" }, () => loadPosts(postSearchQuery))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  useEffect(() => {
    if (!user || activeTab !== "posts") return;
    const delay = window.setTimeout(() => loadPosts(postSearchQuery), 350);
    return () => window.clearTimeout(delay);
  }, [postSearchQuery, activeTab, user?.id]);

  useEffect(() => {
    const delay = window.setTimeout(searchColleagues, 400);
    return () => window.clearTimeout(delay);
  }, [searchQuery, connections, requests, user?.id]);

  const networkTabs = [
    { id: "posts", label: "Posts", icon: Newspaper },
    { id: "colleagues", label: "Colleagues", icon: Users },
    { id: "search", label: "Find Colleagues", icon: Search }
  ];

  async function loadNetworkData() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: connData } = await supabase
        .from("connections")
        .select(`
          id, requester_id, receiver_id,
          requester:profiles!connections_requester_id_fkey(id, avatar_url, full_name, title, practice_name, location, qualifications, email),
          receiver:profiles!connections_receiver_id_fkey(id, avatar_url, full_name, title, practice_name, location, qualifications, email)
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

      setConnections((connData || []).map(conn => ({
        connection_id: conn.id,
        colleague: conn.requester_id === user.id ? conn.receiver : conn.requester
      })));

      const { data: reqData } = await supabase
        .from("connections")
        .select(`id, created_at, requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications)`)
        .eq("receiver_id", user.id)
        .eq("status", "pending");
      setRequests(reqData || []);

      const { data: sentReqData } = await supabase
        .from("connections")
        .select(`
          id, receiver_id, created_at,
          receiver:profiles!connections_receiver_id_fkey(id, full_name, title, qualifications, practice_name, location)
        `)
        .eq("requester_id", user.id)
        .eq("status", "pending");
      setSentRequests((sentReqData || []).map(request => request.receiver_id));
      setSentRequestDetails(sentReqData || []);
    } catch {
      toast.error("Failed to load network data");
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts(term = "") {
    if (!user) return;
    setPostLoading(true);
    let query = supabase
      .from("network_posts")
      .select(`
        id, author_id, body, shared_type, shared_title, shared_url, shared_payload, created_at, updated_at,
        author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)
      `)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(term.trim() ? 100 : 30);

    const cleanedTerm = term.trim().replace(/[%,]/g, " ").trim();
    if (cleanedTerm.length >= 2) {
      query = query.or(`body.ilike.%${cleanedTerm}%,shared_title.ilike.%${cleanedTerm}%`);
    }

    const { data, error } = await query;
    if (error) {
      setPosts([]);
      setPostsAvailable(false);
    } else {
      setPosts(data || []);
      setPostsAvailable(true);
    }
    setPostLoading(false);
  }

  async function loadShareableItems() {
    if (!user?.id) return;
    const [casesRes, protocolsRes] = await Promise.all([
      supabase
        .from("caselogs")
        .select("id, title, category, patient_name, species, breed, age, gender, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("protocols")
        .select("id, name, indication, drug_ids, drug_doses, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30)
    ]);
    if (!casesRes.error) setShareableCases(casesRes.data || []);
    if (!protocolsRes.error) setShareableProtocols(protocolsRes.data || []);
  }

  async function searchColleagues() {
    if (!user?.id || searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, title, qualifications")
      .neq("id", user.id)
      .ilike("full_name", `%${searchQuery.trim()}%`)
      .limit(15);

    if (error) {
      toast.error("Search failed");
      setSearchResults([]);
    } else {
      const candidateIds = (data || []).map(result => result.id);
      let hiddenProfileIds = new Set();
      if (candidateIds.length > 0) {
        const { data: preferenceRows, error: preferenceError } = await supabase
          .from("user_preferences")
          .select("user_id, app_preferences")
          .in("user_id", candidateIds);
        if (!preferenceError) {
          hiddenProfileIds = new Set((preferenceRows || []).filter(row => row.app_preferences?.privacyMode === true).map(row => row.user_id));
        }
      }

      setSearchResults((data || []).filter(result =>
        !hiddenProfileIds.has(result.id) &&
        !connections.some(connection => connection.colleague?.id === result.id) &&
        !requests.some(request => request.requester?.id === result.id)
      ));
    }
    setSearching(false);
  }

  const openColleagueProfile = async (colleague) => {
    if (!colleague?.id) return;
    setSelectedColleague(colleague);
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, avatar_url, full_name, title, practice_name, location, email, phone, mobile, website, bio, qualifications, degrees, certifications, rcvs_number, areas_of_interest, memberships")
      .eq("id", colleague.id)
      .maybeSingle();

    if (error) toast.error("Could not load colleague profile");
    else setSelectedColleague({ ...colleague, ...(data || {}) });
    setProfileLoading(false);
  };

  const handleSendRequest = async (receiverId) => {
    setBusyId(receiverId);
    const { error } = await supabase.from("connections").upsert({ requester_id: user.id, receiver_id: receiverId, status: "pending" }, { onConflict: "requester_id, receiver_id" });
    if (error) toast.error("Failed to send request");
    else {
      toast.success("Connection request sent");
      setSentRequests(prev => [...prev, receiverId]);
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRespond = async (connectionId, status) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").update({ status }).eq("id", connectionId).eq("receiver_id", user.id);
    if (error) toast.error("Failed to update request");
    else {
      toast.success(status === "accepted" ? "Colleague added" : "Request declined");
      await loadNetworkData();
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRemoveConnection = async (connectionId) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").delete().eq("id", connectionId);
    if (error) toast.error("Failed to remove colleague");
    else {
      setConnections(prev => prev.filter(connection => connection.connection_id !== connectionId));
      toast.success("Colleague removed");
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const updatePostForm = (field, value) => setPostForm(prev => ({ ...prev, [field]: value, ...(field === "shared_type" || field === "shared_title" || field === "shared_url" ? { shared_payload: null } : {}) }));
  const updateEditForm = (field, value) => setEditForm(prev => ({ ...prev, [field]: value, ...(field === "shared_type" || field === "shared_title" || field === "shared_url" ? { shared_payload: null } : {}) }));

  const attachOwnItem = (kind, id, isEditing = false) => {
    const source = kind === "caselog" ? shareableCases : shareableProtocols;
    const item = source.find(entry => String(entry.id) === String(id));
    if (!item) return;

    const nextAttachment = {
      shared_type: kind,
      shared_title: kind === "caselog" ? item.title : item.name,
      shared_url: `shared://${kind}/${item.id}`,
      shared_payload: buildSharedPayload(kind, item)
    };

    if (isEditing) setEditForm(prev => ({ ...prev, ...nextAttachment }));
    else setPostForm(prev => ({ ...prev, ...nextAttachment }));
  };

  const clearAttachment = (isEditing = false) => {
    const blank = { shared_type: "", shared_title: "", shared_url: "", shared_payload: null };
    if (isEditing) setEditForm(prev => ({ ...prev, ...blank }));
    else setPostForm(prev => ({ ...prev, ...blank }));
  };

  const createPost = async () => {
    if (!user?.id || postSaving) return;
    const body = postForm.body.trim();
    const sharedTitle = postForm.shared_title.trim();
    if (!body && !sharedTitle) return toast.error("Write a post or add something to share");

    setPostSaving(true);
    const { data, error } = await supabase
      .from("network_posts")
      .insert({
        author_id: user.id,
        body: body || null,
        shared_type: postForm.shared_type || null,
        shared_title: sharedTitle || null,
        shared_url: postForm.shared_url.trim() || null,
        shared_payload: postForm.shared_payload || null
      })
      .select(`
        id, author_id, body, shared_type, shared_title, shared_url, shared_payload, created_at, updated_at,
        author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)
      `)
      .single();

    setPostSaving(false);
    if (error) {
      setPostsAvailable(false);
      return toast.error("Could not create post. Run the updated Network posts SQL first.");
    }

    setPosts(prev => [data, ...prev]);
    setPostForm(defaultPostForm);
    setComposerOpen(false);
    setPostsAvailable(true);
    toast.success("Post shared");
  };

  const startEditingPost = (post) => {
    setEditingPostId(post.id);
    setEditForm({
      body: post.body || "",
      shared_type: post.shared_type || "",
      shared_title: post.shared_title || "",
      shared_url: post.shared_url || "",
      shared_payload: post.shared_payload || null
    });
  };

  const cancelEditingPost = () => {
    setEditingPostId(null);
    setEditForm(defaultPostForm);
  };

  const updatePost = async (postId) => {
    if (postUpdating) return;
    const body = editForm.body.trim();
    const sharedTitle = editForm.shared_title.trim();
    if (!body && !sharedTitle) return toast.error("Keep some post text or an attachment");

    setPostUpdating(true);
    const { data, error } = await supabase
      .from("network_posts")
      .update({
        body: body || null,
        shared_type: editForm.shared_type || null,
        shared_title: sharedTitle || null,
        shared_url: editForm.shared_url.trim() || null,
        shared_payload: editForm.shared_payload || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", postId)
      .eq("author_id", user.id)
      .select(`
        id, author_id, body, shared_type, shared_title, shared_url, shared_payload, created_at, updated_at,
        author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)
      `)
      .single();

    setPostUpdating(false);
    if (error) return toast.error("Could not update post");
    setPosts(prev => prev.map(post => post.id === postId ? data : post));
    cancelEditingPost();
    toast.success("Post updated");
  };

  const deletePost = async (postId) => {
    const { error } = await supabase.from("network_posts").update({ is_deleted: true }).eq("id", postId).eq("author_id", user.id);
    if (error) return toast.error("Could not delete post");
    setPosts(prev => prev.filter(post => post.id !== postId));
    toast.success("Post deleted");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <HeartbeatLoader size={80} />
        <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading Network...</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {selectedColleague && <ColleagueProfileModal colleague={selectedColleague} loading={profileLoading} darkMode={darkMode} onClose={() => setSelectedColleague(null)} />}
      {sharedViewer && <SharedAttachmentModal post={sharedViewer} darkMode={darkMode} onClose={() => setSharedViewer(null)} />}

      <PageBanner
        title="Professional Network"
        subtitle="Manage colleagues, posts and professional connections."
        darkMode={darkMode}
        badges={[{ label: `${requests.length} pending`, icon: <UserPlus size={13} />, accent: true }]}
      />

      <PageToolbar items={networkTabs} activeId={activeTab} onChange={setActiveTab} darkMode={darkMode} className="mb-6" />

      {activeTab === "posts" && (
        <PostsTab
          darkMode={darkMode}
          panelClass={panelClass}
          fieldClass={fieldClass}
          postsAvailable={postsAvailable}
          postSearchQuery={postSearchQuery}
          setPostSearchQuery={setPostSearchQuery}
          composerOpen={composerOpen}
          setComposerOpen={setComposerOpen}
          postForm={postForm}
          postSaving={postSaving}
          shareableCases={shareableCases}
          shareableProtocols={shareableProtocols}
          updatePostForm={updatePostForm}
          attachOwnItem={attachOwnItem}
          clearAttachment={clearAttachment}
          createPost={createPost}
          posts={posts}
          postLoading={postLoading}
          user={user}
          editForm={editForm}
          editingPostId={editingPostId}
          postUpdating={postUpdating}
          startEditingPost={startEditingPost}
          cancelEditingPost={cancelEditingPost}
          updateEditForm={updateEditForm}
          updatePost={updatePost}
          deletePost={deletePost}
          setSharedViewer={setSharedViewer}
        />
      )}

      {activeTab === "colleagues" && (
        <ColleaguesTab
          requests={requests}
          connections={connections}
          panelClass={panelClass}
          darkMode={darkMode}
          busyId={busyId}
          onRespond={handleRespond}
          onOpenProfile={openColleagueProfile}
          onRemoveConnection={handleRemoveConnection}
        />
      )}

      {activeTab === "search" && (
        <SearchTab
          darkMode={darkMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searching={searching}
          searchResults={searchResults}
          sentRequests={sentRequests}
          requests={requests}
          sentRequestDetails={sentRequestDetails}
          panelClass={panelClass}
          busyId={busyId}
          onSendRequest={handleSendRequest}
          onRespond={handleRespond}
        />
      )}
    </div>
  );
}

function PostsTab(props) {
  const {
    darkMode, panelClass, fieldClass, postsAvailable, postSearchQuery, setPostSearchQuery, composerOpen, setComposerOpen,
    postForm, postSaving, shareableCases, shareableProtocols, updatePostForm, attachOwnItem, clearAttachment, createPost,
    posts, postLoading, user, editForm, editingPostId, postUpdating, startEditingPost, cancelEditingPost, updateEditForm,
    updatePost, deletePost, setSharedViewer
  } = props;

  return (
    <div className="space-y-4">
      {!postsAvailable && (
        <div className={`${panelClass} border-l-4 border-amber-400`}>
          <h3 className="font-black mb-1">Posts need the updated Supabase SQL</h3>
          <p className="text-sm opacity-70 leading-6">Run the updated network posts SQL file, then refresh this page.</p>
        </div>
      )}

      <div className="flex gap-2">
        <div className={`flex-1 flex items-center px-4 py-3 rounded-lg border ${darkMode ? "bg-white/10 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
          <Search size={17} className="opacity-50 mr-2 shrink-0" />
          <input className="w-full bg-transparent border-none outline-none text-sm" placeholder="Search all posts..." value={postSearchQuery} onChange={(event) => setPostSearchQuery(event.target.value)} />
        </div>
        <button onClick={() => setComposerOpen(prev => !prev)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-4 py-3 font-black flex items-center gap-2 shrink-0">
          {composerOpen ? <X size={17} /> : <PlusCircle size={17} />}
          {composerOpen ? "Close" : "Post"}
        </button>
      </div>

      {composerOpen && (
        <PostComposer
          title="Share a post"
          subtitle="Post an update, case discussion, drug note, protocol or useful resource."
          form={postForm}
          darkMode={darkMode}
          panelClass={panelClass}
          fieldClass={fieldClass}
          shareableCases={shareableCases}
          shareableProtocols={shareableProtocols}
          saving={postSaving}
          saveLabel="Share post"
          onChange={updatePostForm}
          onAttach={attachOwnItem}
          onClearAttachment={() => clearAttachment(false)}
          onSave={createPost}
        />
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-black uppercase tracking-widest opacity-60 flex items-center gap-2"><Newspaper size={16}/> {postSearchQuery.trim() ? "Search Results" : "Recent Posts"}</h3>
        {postLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={28} /></div>
        ) : posts.length === 0 ? (
          <div className={`${panelClass} text-center opacity-60 py-8`}>{postSearchQuery.trim() ? "No posts matched your search." : "No posts yet. Start the first conversation."}</div>
        ) : (
          posts.map(post => (
            <NetworkPost
              key={post.id}
              post={post}
              user={user}
              darkMode={darkMode}
              panelClass={panelClass}
              fieldClass={fieldClass}
              editForm={editForm}
              editing={editingPostId === post.id}
              postUpdating={postUpdating}
              shareableCases={shareableCases}
              shareableProtocols={shareableProtocols}
              onEdit={() => startEditingPost(post)}
              onCancelEdit={cancelEditingPost}
              onEditChange={updateEditForm}
              onAttachEdit={(kind, id) => attachOwnItem(kind, id, true)}
              onClearEditAttachment={() => clearAttachment(true)}
              onUpdate={() => updatePost(post.id)}
              onDelete={deletePost}
              onOpenShared={() => setSharedViewer(post)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function PostComposer({ title, subtitle, form, darkMode, panelClass, fieldClass, shareableCases, shareableProtocols, saving, saveLabel, onChange, onAttach, onClearAttachment, onSave }) {
  return (
    <section className={`${panelClass} space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}><Share2 size={18} /></div>
        <div>
          <h2 className="font-black text-lg">{title}</h2>
          {subtitle && <p className="text-sm opacity-60 leading-6">{subtitle}</p>}
        </div>
      </div>

      <textarea className={fieldClass} rows="4" placeholder="What would you like to share with the network?" value={form.body} onChange={(event) => onChange("body", event.target.value)} />

      <div className={`rounded-lg border p-3 space-y-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
        <div className="flex items-start gap-2">
          <Paperclip size={16} className="text-[#0F8F83] mt-0.5" />
          <div>
            <p className="font-black text-sm">Attach one of yours</p>
            <p className="text-xs opacity-60 leading-5">This stores a shareable snapshot so other users can open it from the post.</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={fieldClass} defaultValue="" onChange={(event) => { onAttach("caselog", event.target.value); event.target.value = ""; }}>
            <option value="">Attach case log</option>
            {shareableCases.map(item => <option key={item.id} value={item.id}>{item.title || "Untitled case"}</option>)}
          </select>
          <select className={fieldClass} defaultValue="" onChange={(event) => { onAttach("protocol", event.target.value); event.target.value = ""; }}>
            <option value="">Attach protocol</option>
            {shareableProtocols.map(item => <option key={item.id} value={item.id}>{item.name || "Untitled protocol"}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select className={fieldClass} value={form.shared_type} onChange={(event) => onChange("shared_type", event.target.value)}>
          {postShareTypes.map(type => <option key={type.value || "general"} value={type.value}>{type.label}</option>)}
        </select>
        <input className={fieldClass} placeholder="Shared item title, optional" value={form.shared_title} onChange={(event) => onChange("shared_title", event.target.value)} />
      </div>

      <input className={fieldClass} placeholder="Optional link, such as /drugs" value={form.shared_url} onChange={(event) => onChange("shared_url", event.target.value)} />

      {(form.shared_title || form.shared_type || form.shared_url) && (
        <button type="button" onClick={onClearAttachment} className={`rounded-lg px-3 py-2 text-xs font-black flex items-center gap-2 ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`}>
          <X size={14} /> Remove attachment
        </button>
      )}

      <button onClick={onSave} disabled={saving} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {saveLabel}
      </button>
    </section>
  );
}

function NetworkPost({ post, user, darkMode, panelClass, fieldClass, editForm, editing, postUpdating, shareableCases, shareableProtocols, onEdit, onCancelEdit, onEditChange, onAttachEdit, onClearEditAttachment, onUpdate, onDelete, onOpenShared }) {
  const authorName = post.author?.full_name || "VetLearn user";
  const initials = authorName.charAt(0).toUpperCase();
  const shareLabel = postShareTypes.find(type => type.value === post.shared_type)?.label || "Shared item";
  const sharedUrl = normaliseSharedUrl(post.shared_url);
  const isAuthor = post.author_id === user?.id;
  const edited = post.updated_at && post.created_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000;

  if (editing) {
    return (
      <PostComposer
        title="Edit post"
        form={editForm}
        darkMode={darkMode}
        panelClass={panelClass}
        fieldClass={fieldClass}
        shareableCases={shareableCases}
        shareableProtocols={shareableProtocols}
        saving={postUpdating}
        saveLabel="Save changes"
        onChange={onEditChange}
        onAttach={onAttachEdit}
        onClearAttachment={onClearEditAttachment}
        onSave={onUpdate}
      />
    );
  }

  return (
    <article className={`${panelClass} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] grid place-items-center shrink-0 overflow-hidden font-black">
            {post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0">
            <div className="font-black truncate">{authorName}</div>
            <div className="text-xs opacity-60 truncate">{post.author?.title || "Veterinary Professional"} · {formatDate(post.created_at)}{edited ? " · edited" : ""}</div>
          </div>
        </div>
        {isAuthor && (
          <div className="flex gap-2 shrink-0">
            <button onClick={onEdit} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Edit post"><Edit3 size={15} /></button>
            <button onClick={() => onDelete(post.id)} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-red-500/15 text-red-200" : "bg-red-50 text-red-600"}`} aria-label="Delete post"><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      {post.body && <p className="text-sm leading-6 whitespace-pre-wrap opacity-85">{post.body}</p>}

      {(post.shared_title || post.shared_type) && (
        <div className={`rounded-lg border p-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]"}`}>
          <div className="flex items-start gap-3">
            <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-white text-[#0F8F83]"} rounded-lg p-2 shrink-0`}><FileText size={16} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{shareLabel}</p>
              <p className="font-black text-sm truncate">{post.shared_title || "Shared resource"}</p>
              {post.shared_payload ? (
                <button onClick={onOpenShared} className="mt-1 inline-block text-xs font-black text-[#0F8F83] dark:text-[#71CFC2]">Open shared item</button>
              ) : sharedUrl ? (
                <Link to={sharedUrl} className="mt-1 inline-block text-xs font-black text-[#0F8F83] dark:text-[#71CFC2]">Open shared item</Link>
              ) : (
                <p className="mt-1 text-xs opacity-55">This older attachment has no shareable preview. Ask the author to reattach it.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function SharedAttachmentModal({ post, darkMode, onClose }) {
  const payload = post.shared_payload || {};
  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  const softClass = darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]";

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl ${modalClass}`}>
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest opacity-50">Shared {post.shared_type || "item"}</p>
            <h2 className="text-2xl font-black leading-tight">{post.shared_title || payload.title || payload.name || "Shared item"}</h2>
          </div>
          <IconButton icon={X} label="Close shared item" darkMode={darkMode} onClick={onClose} />
        </div>

        {post.shared_type === "caselog" ? (
          <div className="space-y-3">
            <SharedRow label="Category" value={payload.category} softClass={softClass} />
            <SharedRow label="Species" value={[payload.species, payload.breed, payload.age, payload.gender].filter(Boolean).join(" · ")} softClass={softClass} />
            <SharedRow label="Description" value={payload.description} softClass={softClass} multiline />
          </div>
        ) : post.shared_type === "protocol" ? (
          <div className="space-y-3">
            <SharedRow label="Indication" value={payload.indication} softClass={softClass} multiline />
            <SharedRow label="Selected drug IDs" value={Array.isArray(payload.drug_ids) ? payload.drug_ids.join(", ") : ""} softClass={softClass} />
            {payload.drug_doses && <SharedRow label="Dose notes" value={JSON.stringify(payload.drug_doses, null, 2)} softClass={softClass} multiline />}
          </div>
        ) : (
          <div className={`${softClass} rounded-lg border p-4 text-sm opacity-80`}>No preview is available for this shared item.</div>
        )}
      </div>
    </div>
  );
}

function SharedRow({ label, value, softClass, multiline = false }) {
  if (!value) return null;
  return (
    <div className={`rounded-lg border p-3 ${softClass}`}>
      <div className="text-xs font-black uppercase tracking-widest opacity-50 mb-1">{label}</div>
      <div className={`text-sm font-bold break-words ${multiline ? "whitespace-pre-wrap leading-6" : ""}`}>{value}</div>
    </div>
  );
}

function buildSharedPayload(kind, item) {
  if (kind === "caselog") {
    return {
      id: item.id,
      title: item.title,
      category: item.category,
      species: item.species,
      breed: item.breed,
      age: item.age,
      gender: item.gender,
      description: item.description,
      created_at: item.created_at
    };
  }

  return {
    id: item.id,
    name: item.name,
    indication: item.indication,
    drug_ids: item.drug_ids,
    drug_doses: item.drug_doses,
    created_at: item.created_at
  };
}

function normaliseSharedUrl(url = "") {
  const trimmed = String(url || "").trim();
  if (trimmed.startsWith("shared://")) return "";
  if (!trimmed.startsWith("/")) return "";
  return trimmed;
}

function formatDate(value) {
  if (!value) return "Just now";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ColleaguesTab({ requests, connections, panelClass, darkMode, busyId, onRespond, onOpenProfile, onRemoveConnection }) {
  return (
    <div className="space-y-6">
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest opacity-60 mb-3 flex items-center gap-2"><UserPlus size={16}/> Pending Requests</h3>
          <div className="space-y-2">
            {requests.map(request => (
              <div key={request.id} className={`${panelClass} flex justify-between items-center border-l-4 border-[#0F8F83]`}>
                <div>
                  <div className="font-bold text-lg">{request.requester?.title} {request.requester?.full_name}</div>
                  <div className="text-xs opacity-70">{request.requester?.qualifications || "Veterinary Professional"}</div>
                </div>
                <div className="flex gap-2">
                  <AppButton onClick={() => onRespond(request.id, "accepted")} icon={busyId === request.id ? Loader2 : Check} darkMode={darkMode} className={busyId === request.id ? "[&_svg]:animate-spin" : ""}>Accept</AppButton>
                  <IconButton icon={X} label="Decline request" darkMode={darkMode} onClick={() => onRespond(request.id, "rejected")} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-black uppercase tracking-widest opacity-60 mb-3 flex items-center gap-2"><Users size={16}/> My Colleagues</h3>
        {connections.length === 0 ? (
          <div className={`${panelClass} text-center opacity-60 py-8`}>You haven't added any colleagues yet.</div>
        ) : (
          <div className="space-y-2">
            {connections.map(connection => (
              <div key={connection.connection_id} className={`${panelClass} flex justify-between items-center gap-4`}>
                <button onClick={() => onOpenProfile(connection.colleague)} className="min-w-0 flex-1 text-left flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] grid place-items-center shrink-0 overflow-hidden font-black">
                    {connection.colleague?.avatar_url ? <img src={connection.colleague.avatar_url} alt="" className="h-full w-full object-cover" /> : connection.colleague?.full_name?.charAt(0) || <UserRound size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{connection.colleague?.title} {connection.colleague?.full_name}</div>
                    <div className="text-xs opacity-60 truncate">{connection.colleague?.email || "Connected colleague"}</div>
                  </div>
                </button>
                <div className="flex gap-2 shrink-0">
                  <Link to={`/messages?colleague=${connection.colleague?.id}`} className={`h-10 w-10 rounded-full grid place-items-center transition ${darkMode ? "bg-white/10 text-[#71CFC2] hover:bg-white/15" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-white"}`} aria-label={`Message ${connection.colleague?.full_name || "colleague"}`}><MessageSquare size={18} /></Link>
                  <IconButton icon={busyId === connection.connection_id ? Loader2 : Trash2} label={`Remove ${connection.colleague?.full_name || "colleague"}`} variant="danger" darkMode={darkMode} className={busyId === connection.connection_id ? "[&_svg]:animate-spin" : ""} disabled={busyId === connection.connection_id} onClick={() => onRemoveConnection(connection.connection_id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchTab({ darkMode, searchQuery, setSearchQuery, searching, searchResults, sentRequests, requests, sentRequestDetails, panelClass, busyId, onSendRequest, onRespond }) {
  return (
    <div className="space-y-4">
      <SearchBox darkMode={darkMode} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search colleagues by name..." icon={searching ? Loader2 : Search} className={searching ? "[&_svg]:animate-spin" : ""} />
      {searchQuery.trim().length > 2 && searchResults.length === 0 && !searching && <div className="text-center opacity-60 py-4 text-sm">No new colleagues found matching "{searchQuery}"</div>}
      {searchResults.length > 0 && (
        <section className="space-y-2">
          {searchResults.map(result => (
            <div key={result.id} className={`${panelClass} flex justify-between items-center`}>
              <div>
                <div className="font-bold text-lg">{result.title} {result.full_name}</div>
                <div className="text-xs opacity-70">{result.qualifications || "Veterinary Professional"}</div>
              </div>
              {sentRequests.includes(result.id) ? <AppButton disabled variant="secondary" darkMode={darkMode}>Pending</AppButton> : <AppButton onClick={() => onSendRequest(result.id)} disabled={busyId === result.id} icon={busyId === result.id ? Loader2 : UserPlus} variant="secondary" darkMode={darkMode} className={busyId === result.id ? "[&_svg]:animate-spin" : ""}>Connect</AppButton>}
            </div>
          ))}
        </section>
      )}
      {(requests.length > 0 || sentRequestDetails.length > 0) && (
        <section className="space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest opacity-60 flex items-center gap-2"><UserPlus size={16}/> Pending Requests</h3>
          {requests.map(request => (
            <div key={request.id} className={`${panelClass} flex justify-between items-center border-l-4 border-[#0F8F83]`}>
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">{request.requester?.title} {request.requester?.full_name}</div>
                <div className="text-xs opacity-70 truncate">{request.requester?.qualifications || "Veterinary Professional"}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#0F8F83] mt-1">Waiting for your response</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <AppButton onClick={() => onRespond(request.id, "accepted")} icon={busyId === request.id ? Loader2 : Check} darkMode={darkMode} className={busyId === request.id ? "[&_svg]:animate-spin" : ""}>Accept</AppButton>
                <IconButton icon={X} label="Decline request" darkMode={darkMode} onClick={() => onRespond(request.id, "rejected")} />
              </div>
            </div>
          ))}
          {sentRequestDetails.map(request => (
            <div key={request.id} className={`${panelClass} flex justify-between items-center`}>
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">{request.receiver?.title} {request.receiver?.full_name}</div>
                <div className="text-xs opacity-70 truncate">{request.receiver?.qualifications || request.receiver?.practice_name || "Veterinary Professional"}</div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-50 mt-1">Request sent</div>
              </div>
              <span className="px-3 py-2 rounded-lg text-xs font-black opacity-60 border shrink-0">Pending</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ColleagueProfileModal({ colleague, loading, darkMode, onClose }) {
  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  const softClass = darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]";
  const initials = colleague?.full_name?.charAt(0) || "V";

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className={`w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl ${modalClass}`}>
        <div className="flex justify-between items-start gap-3 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-16 w-16 rounded-2xl bg-[#71CFC2] text-[#062F63] grid place-items-center shrink-0 overflow-hidden text-2xl font-black">
              {colleague?.avatar_url ? <img src={colleague.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black leading-tight truncate">{colleague?.full_name || "Colleague"}</h2>
              <p className="text-sm opacity-65">{colleague?.title || "Veterinary Professional"}</p>
            </div>
          </div>
          <IconButton icon={X} label="Close colleague profile" darkMode={darkMode} onClick={onClose} />
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <HeartbeatLoader size={64} />
            <p className="font-bold opacity-70 text-sm tracking-widest uppercase text-[#71CFC2]">Loading profile...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2">
              <ProfileRow icon={<Briefcase size={16} />} label="Practice" value={colleague?.practice_name} softClass={softClass} />
              <ProfileRow icon={<MapPin size={16} />} label="Location" value={colleague?.location} softClass={softClass} />
              <ProfileRow icon={<Mail size={16} />} label="Email" value={colleague?.email} softClass={softClass} />
              <ProfileRow icon={<Phone size={16} />} label="Phone" value={colleague?.mobile || colleague?.phone} softClass={softClass} />
              <ProfileRow icon={<Globe size={16} />} label="Website" value={colleague?.website} softClass={softClass} isLink />
              <ProfileRow icon={<GraduationCap size={16} />} label="Qualifications" value={colleague?.qualifications || colleague?.degrees || colleague?.certifications} softClass={softClass} />
            </div>
            {colleague?.bio && <section className={`rounded-lg border p-4 ${softClass}`}><h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">About</h3><p className="text-sm leading-6 opacity-80 whitespace-pre-wrap">{colleague.bio}</p></section>}
            {(colleague?.areas_of_interest || colleague?.memberships || colleague?.rcvs_number) && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Professional Details</h3>
                {colleague?.rcvs_number && <p className="text-sm mb-2"><span className="font-black opacity-60">RCVS: </span>{colleague.rcvs_number}</p>}
                {colleague?.areas_of_interest && <p className="text-sm mb-2"><span className="font-black opacity-60">Interests: </span>{colleague.areas_of_interest}</p>}
                {colleague?.memberships && <p className="text-sm"><span className="font-black opacity-60">Memberships: </span>{colleague.memberships}</p>}
              </section>
            )}
            <Link to={`/messages?colleague=${colleague?.id}`} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2"><MessageSquare size={18} /> Message Colleague</Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value, softClass, isLink = false }) {
  if (!value) return null;
  const content = isLink ? <a href={value} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#0F8F83] break-all">{value}</a> : <div className="text-sm font-bold break-words">{value}</div>;
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-3 ${softClass}`}>
      <div className="mt-0.5 text-[#0F8F83] shrink-0">{icon}</div>
      <div className="min-w-0"><div className="text-xs font-black uppercase tracking-widest opacity-50 mb-1">{label}</div>{content}</div>
    </div>
  );
}
