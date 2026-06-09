import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Briefcase,
  Check,
  Edit3,
  FileText,
  Globe,
  GraduationCap,
  Image as ImageIcon,
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

const POST_CATEGORIES = [
  "All", "General", "Medicine", "Surgery", "Emergency", 
  "Dentistry", "Imaging", "Drugs", "Protocols", "Ideas", 
  "Questions", "CPD", "Other"
];

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
  shared_payload: null,
  post_category: "General",
  visibility: "network",
  images: [],
  existing_urls: []
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
  const [activeCategory, setActiveCategory] = useState("All");
  
  const [postForm, setPostForm] = useState(defaultPostForm);
  const [editForm, setEditForm] = useState(defaultPostForm);
  const [editingPostId, setEditingPostId] = useState(null);
  const [imagesToDelete, setImagesToDelete] = useState([]);
  
  const [composerOpen, setComposerOpen] = useState(false);
  const [shareableCases, setShareableCases] = useState([]);
  const [shareableProtocols, setShareableProtocols] = useState([]);
  const [sharedViewer, setSharedViewer] = useState(null);
  const [fullImagePreview, setFullImagePreview] = useState(null);
  
  const [postsAvailable, setPostsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [postLoading, setPostLoading] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [postUpdating, setPostUpdating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedColleague, setSelectedColleague] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  
  const [gdprModalState, setGdprModalState] = useState({ open: false, mode: null });

  const panelClass = darkMode
    ? "bg-white/10 border border-white/10 rounded-lg p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)]"
    : "bg-white/90 border border-[#DCEDEA] rounded-lg p-5 shadow-[0_14px_35px_rgba(11,55,96,0.07)]";
  const fieldClass = `w-full border border-transparent focus:border-[#71CFC2] outline-none rounded-lg p-3 text-sm transition ${darkMode ? "bg-white/10 text-white placeholder:text-slate-400" : "bg-[#F0F6F5] text-[#113247] placeholder:text-slate-500"}`;

  useEffect(() => {
    if (!user) return;
    loadNetworkData();
    loadShareableItems();

    const channel = supabase
      .channel(`network-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => {
        loadNetworkData();
        window.dispatchEvent(new Event("networkUpdated"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "network_posts" }, () => loadPosts(postSearchQuery, activeCategory))
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  useEffect(() => {
    if (!user || activeTab !== "posts") return;
    const delay = window.setTimeout(() => loadPosts(postSearchQuery, activeCategory), 350);
    return () => window.clearTimeout(delay);
  }, [postSearchQuery, activeCategory, activeTab, user?.id]);

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

  async function loadPosts(term = "", category = "All") {
    if (!user) return;
    setPostLoading(true);

    // Get allowed connection IDs for 'colleagues' visibility
    const { data: myConns } = await supabase.from("connections").select("requester_id, receiver_id").eq("status", "accepted").or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
    const allowedIds = [user.id];
    (myConns || []).forEach(c => allowedIds.push(c.requester_id === user.id ? c.receiver_id : c.requester_id));
    const allowedIdsString = allowedIds.join(",");

    let query = supabase
      .from("network_posts")
      .select(`
        id, author_id, body, shared_type, shared_title, shared_url, shared_payload, attachment_urls, visibility, post_category, created_at, updated_at,
        author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)
      `)
      .eq("is_deleted", false)
      .or(`visibility.eq.network,and(visibility.eq.colleagues,author_id.in.(${allowedIdsString}))`)
      .order("created_at", { ascending: false })
      .limit(term.trim() ? 100 : 30);

    if (category !== "All") query = query.eq("post_category", category);

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
      supabase.from("caselogs").select("id, title, category, patient_name, species, breed, age, gender, description, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
      supabase.from("protocols").select("id, name, indication, drug_ids, drug_doses, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30)
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
    const { data, error } = await supabase.from("profiles").select("id, full_name, title, qualifications").neq("id", user.id).ilike("full_name", `%${searchQuery.trim()}%`).limit(15);
    if (error) {
      setSearchResults([]);
    } else {
      const candidateIds = (data || []).map(result => result.id);
      let hiddenProfileIds = new Set();
      if (candidateIds.length > 0) {
        const { data: prefs } = await supabase.from("user_preferences").select("user_id, app_preferences").in("user_id", candidateIds);
        hiddenProfileIds = new Set((prefs || []).filter(r => r.app_preferences?.privacyMode === true).map(r => r.user_id));
      }
      setSearchResults((data || []).filter(result => !hiddenProfileIds.has(result.id) && !connections.some(c => c.colleague?.id === result.id) && !requests.some(r => r.requester?.id === result.id)));
    }
    setSearching(false);
  }

  const openColleagueProfile = async (colleague) => {
    if (!colleague?.id) return;
    setSelectedColleague(colleague);
    setProfileLoading(true);
    const { data, error } = await supabase.from("profiles").select("id, avatar_url, full_name, title, practice_name, location, email, phone, mobile, website, bio, qualifications, degrees, certifications, rcvs_number, areas_of_interest, memberships").eq("id", colleague.id).maybeSingle();
    if (!error) setSelectedColleague({ ...colleague, ...(data || {}) });
    setProfileLoading(false);
  };

  const handleSendRequest = async (receiverId) => {
    setBusyId(receiverId);
    const { error } = await supabase.from("connections").upsert({ requester_id: user.id, receiver_id: receiverId, status: "pending" }, { onConflict: "requester_id, receiver_id" });
    if (!error) {
      toast.success("Connection request sent");
      setSentRequests(prev => [...prev, receiverId]);
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRespond = async (connectionId, status) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").update({ status }).eq("id", connectionId).eq("receiver_id", user.id);
    if (!error) {
      toast.success(status === "accepted" ? "Colleague added" : "Request declined");
      await loadNetworkData();
      window.dispatchEvent(new Event("networkUpdated"));
    }
    setBusyId(null);
  };

  const handleRemoveConnection = async (connectionId) => {
    setBusyId(connectionId);
    const { error } = await supabase.from("connections").delete().eq("id", connectionId);
    if (!error) {
      setConnections(prev => prev.filter(c => c.connection_id !== connectionId));
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

  const uploadImagesToStorage = async (files) => {
    const paths = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${user.id}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from("network-post-media").upload(path, file, { upsert: true });
      if (!error) paths.push(path);
      else toast.error(`Failed to upload ${file.name}`);
    }
    return paths;
  };

  const requestPostSave = (mode) => {
    const form = mode === "create" ? postForm : editForm;
    const hasNewImages = form.images && form.images.length > 0;
    
    if (!form.body.trim() && !form.shared_title.trim() && !hasNewImages && form.existing_urls?.length === 0) {
      return toast.error("Write a post or add an attachment");
    }

    if (hasNewImages) {
      setGdprModalState({ open: true, mode });
    } else {
      if (mode === "create") executeCreatePost();
      else executeUpdatePost();
    }
  };

  const executeCreatePost = async () => {
    setPostSaving(true);
    const uploadedPaths = await uploadImagesToStorage(postForm.images);
    
    const { data, error } = await supabase.from("network_posts").insert({
      author_id: user.id,
      body: postForm.body.trim() || null,
      shared_type: postForm.shared_type || null,
      shared_title: postForm.shared_title.trim() || null,
      shared_url: postForm.shared_url.trim() || null,
      shared_payload: postForm.shared_payload || null,
      attachment_urls: uploadedPaths,
      visibility: postForm.visibility,
      post_category: postForm.post_category
    }).select(`id, author_id, body, shared_type, shared_title, shared_url, shared_payload, attachment_urls, visibility, post_category, created_at, updated_at, author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)`).single();

    setPostSaving(false);
    if (error) {
      setPostsAvailable(false);
      return toast.error("Could not create post. Run updated SQL.");
    }
    
    setPosts(prev => [data, ...prev]);
    setPostForm(defaultPostForm);
    setComposerOpen(false);
    setPostsAvailable(true);
    toast.success("Post shared");
  };

  const startEditingPost = (post) => {
    setEditingPostId(post.id);
    setImagesToDelete([]);
    setEditForm({
      body: post.body || "",
      shared_type: post.shared_type || "",
      shared_title: post.shared_title || "",
      shared_url: post.shared_url || "",
      shared_payload: post.shared_payload || null,
      post_category: post.post_category || "General",
      visibility: post.visibility || "network",
      images: [],
      existing_urls: post.attachment_urls || []
    });
  };

  const cancelEditingPost = () => {
    setEditingPostId(null);
    setImagesToDelete([]);
    setEditForm(defaultPostForm);
  };

  const executeUpdatePost = async () => {
    setPostUpdating(true);
    if (imagesToDelete.length > 0) {
      await supabase.storage.from("network-post-media").remove(imagesToDelete);
    }
    
    const newUploadedPaths = await uploadImagesToStorage(editForm.images);
    const finalAttachmentUrls = [...editForm.existing_urls, ...newUploadedPaths];

    const { data, error } = await supabase.from("network_posts").update({
      body: editForm.body.trim() || null,
      shared_type: editForm.shared_type || null,
      shared_title: editForm.shared_title.trim() || null,
      shared_url: editForm.shared_url.trim() || null,
      shared_payload: editForm.shared_payload || null,
      attachment_urls: finalAttachmentUrls,
      visibility: editForm.visibility,
      post_category: editForm.post_category,
      updated_at: new Date().toISOString()
    }).eq("id", editingPostId).eq("author_id", user.id).select(`id, author_id, body, shared_type, shared_title, shared_url, shared_payload, attachment_urls, visibility, post_category, created_at, updated_at, author:profiles!network_posts_author_id_fkey(id, full_name, title, avatar_url)`).single();

    setPostUpdating(false);
    if (error) return toast.error("Could not update post");
    setPosts(prev => prev.map(p => p.id === editingPostId ? data : p));
    cancelEditingPost();
    toast.success("Post updated");
  };

  const deletePost = async (postId) => {
    const postToDelete = posts.find(p => p.id === postId);
    const { error } = await supabase.from("network_posts").update({ is_deleted: true }).eq("id", postId).eq("author_id", user.id);
    if (error) return toast.error("Could not delete post");
    
    if (postToDelete?.attachment_urls?.length > 0) {
      await supabase.storage.from("network-post-media").remove(postToDelete.attachment_urls);
    }
    
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast.success("Post deleted");
  };

  const openSharedPost = async (post) => {
    if (!post) return;
    if (post.shared_payload) return setSharedViewer(post);
    
    const rawUrl = String(post.shared_url || "").trim();
    const sharedMatch = rawUrl.match(/^shared:\/\/(caselog|protocol)\/([^/?#]+)/);
    const kind = sharedMatch?.[1] || post.shared_type;
    const sharedId = sharedMatch?.[2] || post.shared_payload?.id;

    if (!["caselog", "protocol"].includes(kind) || !sharedId) {
      toast.error("This shared item has no popup preview. Ask the author to reattach it.");
      return;
    }

    const table = kind === "caselog" ? "caselogs" : "protocols";
    const selectFields = kind === "caselog" 
      ? "id, title, category, patient_name, species, breed, age, gender, description, created_at" 
      : "id, name, indication, drug_ids, drug_doses, created_at";
      
    const { data, error } = await supabase.from(table).select(selectFields).eq("id", sharedId).maybeSingle();

    if (error || !data) return toast.error(`Could not open shared ${kind === "caselog" ? "case log" : "protocol"}`);
    
    setSharedViewer({ 
      ...post, 
      shared_type: kind, 
      shared_title: post.shared_title || data.title || data.name || "Shared item", 
      shared_url: rawUrl, 
      shared_payload: buildSharedPayload(kind, data) 
    });
  };

  return (
    <div className="pb-8">
      {selectedColleague && <ColleagueProfileModal colleague={selectedColleague} loading={profileLoading} darkMode={darkMode} onClose={() => setSelectedColleague(null)} />}
      {sharedViewer && <SharedAttachmentModal post={sharedViewer} user={user} darkMode={darkMode} onClose={() => setSharedViewer(null)} />}
      {fullImagePreview && <PostImagePreviewModal url={fullImagePreview} darkMode={darkMode} onClose={() => setFullImagePreview(null)} />}
      
      {gdprModalState.open && (
        <GdprImageWarningModal 
          darkMode={darkMode} 
          onCancel={() => setGdprModalState({ open: false, mode: null })} 
          onConfirm={() => {
            const mode = gdprModalState.mode;
            setGdprModalState({ open: false, mode: null });
            if (mode === "create") executeCreatePost();
            else executeUpdatePost();
          }} 
        />
      )}

      <PageBanner 
        title="Professional Network" 
        subtitle="Manage colleagues, posts and professional connections." 
        darkMode={darkMode} 
        badges={[{ label: `${requests.length} pending`, icon: <UserPlus size={13} />, accent: true }]} 
      />
      <PageToolbar items={networkTabs} activeId={activeTab} onChange={setActiveTab} darkMode={darkMode} className="mb-6" />

      {activeTab === "posts" && (
        <PostsTab
          darkMode={darkMode} panelClass={panelClass} fieldClass={fieldClass}
          postsAvailable={postsAvailable} postSearchQuery={postSearchQuery} setPostSearchQuery={setPostSearchQuery}
          activeCategory={activeCategory} setActiveCategory={setActiveCategory}
          composerOpen={composerOpen} setComposerOpen={setComposerOpen}
          postForm={postForm} postSaving={postSaving} shareableCases={shareableCases} shareableProtocols={shareableProtocols}
          updatePostForm={updatePostForm} attachOwnItem={attachOwnItem} clearAttachment={clearAttachment} requestPostSave={() => requestPostSave("create")}
          posts={posts} postLoading={postLoading} user={user}
          editForm={editForm} editingPostId={editingPostId} postUpdating={postUpdating}
          startEditingPost={startEditingPost} cancelEditingPost={cancelEditingPost} updateEditForm={updateEditForm}
          onRemoveExistingImage={(path) => {
            setEditForm(prev => ({ ...prev, existing_urls: prev.existing_urls.filter(p => p !== path) }));
            setImagesToDelete(prev => [...prev, path]);
          }}
          requestUpdateSave={() => requestPostSave("edit")} deletePost={deletePost}
          setSharedViewer={openSharedPost} setFullImagePreview={setFullImagePreview}
        />
      )}

      {activeTab === "colleagues" && (
        <ColleaguesTab 
          requests={requests} connections={connections} panelClass={panelClass} 
          darkMode={darkMode} busyId={busyId} onRespond={handleRespond} 
          onOpenProfile={openColleagueProfile} onRemoveConnection={handleRemoveConnection} 
        />
      )}
      
      {activeTab === "search" && (
        <SearchTab 
          darkMode={darkMode} searchQuery={searchQuery} setSearchQuery={setSearchQuery} 
          searching={searching} searchResults={searchResults} sentRequests={sentRequests} 
          requests={requests} sentRequestDetails={sentRequestDetails} panelClass={panelClass} 
          busyId={busyId} onSendRequest={handleSendRequest} onRespond={handleRespond} 
        />
      )}
    </div>
  );
}

function PostsTab(props) {
  const {
    darkMode, panelClass, fieldClass, postsAvailable, postSearchQuery, setPostSearchQuery, 
    activeCategory, setActiveCategory, composerOpen, setComposerOpen,
    postForm, postSaving, shareableCases, shareableProtocols, updatePostForm, attachOwnItem, clearAttachment, requestPostSave,
    posts, postLoading, user, editForm, editingPostId, postUpdating, startEditingPost, cancelEditingPost, updateEditForm,
    onRemoveExistingImage, requestUpdateSave, deletePost, setSharedViewer, setFullImagePreview
  } = props;

  return (
    <div className="space-y-4">
      {!postsAvailable && (
        <div className={`${panelClass} border-l-4 border-amber-400`}>
          <h3 className="font-black mb-1">Posts need the updated Supabase SQL</h3>
          <p className="text-sm opacity-70 leading-6">Run the updated network posts SQL file, then refresh this page.</p>
        </div>
      )}

      <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
        {POST_CATEGORIES.map(cat => (
          <button 
            key={cat} 
            onClick={() => setActiveCategory(cat)} 
            className={`px-4 py-2 rounded-full whitespace-nowrap font-bold text-xs transition ${activeCategory === cat ? "bg-[#71CFC2] text-[#062F63]" : darkMode ? "bg-white/10 text-slate-300 hover:bg-white/20" : "bg-[#E8F8F5] text-[#0B3760] hover:bg-[#DCEDEA]"}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className={`flex-1 flex items-center px-4 py-3 rounded-lg border ${darkMode ? "bg-white/10 border-white/10" : "bg-white border-[#DCEDEA]"}`}>
          <Search size={17} className="opacity-50 mr-2 shrink-0" />
          <input className="w-full bg-transparent border-none outline-none text-sm" placeholder="Search posts..." value={postSearchQuery} onChange={(e) => setPostSearchQuery(e.target.value)} />
        </div>
        <button onClick={() => setComposerOpen(prev => !prev)} className="rounded-lg bg-[#71CFC2] text-[#062F63] px-4 py-3 font-black flex items-center gap-2 shrink-0">
          {composerOpen ? <X size={17} /> : <PlusCircle size={17} />} <span className="hidden sm:inline">{composerOpen ? "Close" : "Post"}</span>
        </button>
      </div>

      {composerOpen && (
        <PostComposer
          title="Share a post" subtitle="Post an update, case discussion, image, or useful resource." form={postForm}
          darkMode={darkMode} panelClass={panelClass} fieldClass={fieldClass}
          shareableCases={shareableCases} shareableProtocols={shareableProtocols}
          saving={postSaving} saveLabel="Share post"
          onChange={updatePostForm} onAttach={attachOwnItem} onClearAttachment={() => clearAttachment(false)} onSave={requestPostSave}
        />
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-black uppercase tracking-widest opacity-60 flex items-center gap-2">
          <Newspaper size={16}/> {postSearchQuery.trim() || activeCategory !== "All" ? "Search Results" : "Recent Posts"}
        </h3>
        
        {postLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#71CFC2]" size={28} /></div>
        ) : posts.length === 0 ? (
          <div className={`${panelClass} text-center opacity-60 py-8`}>No posts found.</div>
        ) : posts.map(post => (
          <NetworkPost
            key={post.id} post={post} user={user} darkMode={darkMode} panelClass={panelClass} fieldClass={fieldClass}
            editForm={editForm} editing={editingPostId === post.id} postUpdating={postUpdating}
            shareableCases={shareableCases} shareableProtocols={shareableProtocols}
            onEdit={() => startEditingPost(post)} onCancelEdit={cancelEditingPost} onEditChange={updateEditForm}
            onRemoveExistingImage={onRemoveExistingImage}
            onAttachEdit={(kind, id) => attachOwnItem(kind, id, true)} onClearEditAttachment={() => clearAttachment(true)}
            onUpdate={requestUpdateSave} onDelete={deletePost}
            onOpenShared={() => setSharedViewer(post)} onOpenImage={setFullImagePreview}
          />
        ))}
      </section>
    </div>
  );
}

function PostComposer({ title, subtitle, form, darkMode, panelClass, fieldClass, shareableCases, shareableProtocols, saving, saveLabel, onChange, onAttach, onClearAttachment, onSave, onRemoveExistingImage }) {
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    onChange("images", [...(form.images || []), ...files]);
    e.target.value = ""; 
  };

  const removeNewImage = (index) => {
    const newImgs = [...form.images];
    newImgs.splice(index, 1);
    onChange("images", newImgs);
  };

  return (
    <section className={`${panelClass} space-y-3 animate-in fade-in slide-in-from-top-4`}>
      <div className="flex items-start gap-3">
        <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0B3760]"} rounded-lg p-3 shrink-0`}><Share2 size={18} /></div>
        <div><h2 className="font-black text-lg">{title}</h2>{subtitle && <p className="text-sm opacity-60 leading-6">{subtitle}</p>}</div>
      </div>

      <textarea className={fieldClass} rows="4" placeholder="What would you like to share with the network?" value={form.body} onChange={(e) => onChange("body", e.target.value)} />

      <div className="flex flex-wrap gap-3">
        <select className={`${fieldClass} w-auto sm:flex-1`} value={form.post_category} onChange={(e) => onChange("post_category", e.target.value)}>
          {POST_CATEGORIES.filter(c => c !== "All").map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select className={`${fieldClass} w-auto sm:flex-1`} value={form.visibility} onChange={(e) => onChange("visibility", e.target.value)}>
          <option value="network">🌐 Entire network</option>
          <option value="colleagues">👥 My colleagues only</option>
        </select>
      </div>

      <div className="flex gap-2 mb-2">
        <label className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-black flex items-center gap-2 transition ${darkMode ? "bg-white/10 text-[#71CFC2] hover:bg-white/20" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-[#DCEDEA]"}`}>
          <ImageIcon size={16} /> Attach images
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
        </label>
      </div>

      {(form.existing_urls?.length > 0 || form.images?.length > 0) && (
        <div className={`p-3 rounded-lg border flex flex-wrap gap-2 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
          {form.existing_urls?.map((url, i) => (
             <div key={`exist-${i}`} className="relative bg-black/10 rounded overflow-hidden h-16 w-16 group">
               <div className="absolute inset-0 grid place-items-center text-[10px] opacity-50 text-center p-1 break-all bg-slate-200 dark:bg-slate-800">Attached</div>
               <button type="button" onClick={() => onRemoveExistingImage(url)} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg opacity-0 group-hover:opacity-100 transition"><X size={12}/></button>
             </div>
          ))}
          {form.images?.map((file, i) => {
            const tempUrl = URL.createObjectURL(file);
            return (
              <div key={`new-${i}`} className="relative rounded overflow-hidden h-16 w-16 group shadow-sm border border-black/10">
                <img src={tempUrl} alt="" className="h-full w-full object-cover" onLoad={() => URL.revokeObjectURL(tempUrl)} />
                <button type="button" onClick={() => removeNewImage(i)} className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-bl-lg opacity-0 group-hover:opacity-100 transition"><X size={12}/></button>
              </div>
            );
          })}
        </div>
      )}

      <div className={`rounded-lg border p-3 space-y-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F9FCFB] border-[#DCEDEA]"}`}>
        <div className="flex items-start gap-2">
          <Paperclip size={16} className="text-[#0F8F83] mt-0.5" />
          <div>
            <p className="font-black text-sm">Attach a safe record snapshot</p>
            <p className="text-xs opacity-60 leading-5">Stores an anonymised copy so others can save it.</p>
          </div>
        </div>
        
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            className={fieldClass}
            value={form.shared_type === "caselog" ? form.shared_url?.replace("shared://caselog/", "") || "" : ""}
            onChange={(event) => {
              const selectedId = event.target.value;
              if (selectedId) onAttach("caselog", selectedId);
            }}
          >
            <option value="">Attach case log</option>
            {shareableCases.map(item => (
              <option key={item.id} value={item.id}>
                {item.title || "Untitled case"}
              </option>
            ))}
          </select>

          <select
            className={fieldClass}
            value={form.shared_type === "protocol" ? form.shared_url?.replace("shared://protocol/", "") || "" : ""}
            onChange={(event) => {
              const selectedId = event.target.value;
              if (selectedId) onAttach("protocol", selectedId);
            }}
          >
            <option value="">Attach protocol</option>
            {shareableProtocols.map(item => (
              <option key={item.id} value={item.id}>
                {item.name || "Untitled protocol"}
              </option>
            ))}
          </select>
        </div>

        {form.shared_type && form.shared_title && (
          <div className={`rounded-lg px-3 py-2 text-xs font-black flex justify-between items-center ${darkMode ? "bg-[#71CFC2]/15 text-[#71CFC2]" : "bg-[#E8F8F5] text-[#0F8F83]"}`}>
            Attached: {form.shared_title}
            <button type="button" onClick={onClearAttachment}><X size={14}/></button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select className={fieldClass} value={form.shared_type} onChange={(e) => onChange("shared_type", e.target.value)}>
          {postShareTypes.map(type => <option key={type.value || "general"} value={type.value}>{type.label}</option>)}
        </select>
        <input className={fieldClass} placeholder="Shared item title, optional" value={form.shared_title} onChange={(e) => onChange("shared_title", e.target.value)} />
      </div>
      
      <input className={fieldClass} placeholder="Optional link, such as /drugs" value={form.shared_url} onChange={(e) => onChange("shared_url", e.target.value)} />

      <button onClick={onSave} disabled={saving} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {saveLabel}
      </button>
    </section>
  );
}

function NetworkPost({ post, user, darkMode, panelClass, fieldClass, editForm, editing, postUpdating, shareableCases, shareableProtocols, onEdit, onCancelEdit, onEditChange, onRemoveExistingImage, onAttachEdit, onClearEditAttachment, onUpdate, onDelete, onOpenShared, onOpenImage }) {
  const [imageUrls, setImageUrls] = useState({});
  const authorName = post.author?.full_name || "VetLearn user";
  const initials = authorName.charAt(0).toUpperCase();
  const shareLabel = postShareTypes.find(type => type.value === post.shared_type)?.label || "Shared item";
  const sharedUrl = normaliseSharedUrl(post.shared_url);
  const isAuthor = post.author_id === user?.id;
  const edited = post.updated_at && post.created_at && new Date(post.updated_at).getTime() - new Date(post.created_at).getTime() > 2000;
  const opensSharedModal = ["caselog", "protocol"].includes(post.shared_type);

  useEffect(() => {
    async function loadUrls() {
      if (!post.attachment_urls?.length) return;
      const { data } = await supabase.storage.from('network-post-media').createSignedUrls(post.attachment_urls, 7 * 24 * 3600);
      if (data) {
        const urlMap = {};
        data.forEach(item => { if (item.signedUrl) urlMap[item.path] = item.signedUrl; });
        setImageUrls(urlMap);
      }
    }
    loadUrls();
  }, [post.attachment_urls]);

  if (editing) {
    return (
      <PostComposer 
        title="Edit post" form={editForm} darkMode={darkMode} panelClass={panelClass} fieldClass={fieldClass} 
        shareableCases={shareableCases} shareableProtocols={shareableProtocols} saving={postUpdating} 
        saveLabel="Save changes" onChange={onEditChange} onRemoveExistingImage={onRemoveExistingImage} 
        onAttach={onAttachEdit} onClearAttachment={onClearEditAttachment} onSave={onUpdate} 
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
            <div className="font-black truncate flex items-center gap-2">
              {authorName}
              {post.visibility === "colleagues" && (
                <span title="Shared with colleagues only" className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${darkMode ? "bg-white/10 text-slate-300" : "bg-black/5 text-slate-600"}`}>
                  <Users size={10} /> Colleagues
                </span>
              )}
            </div>
            <div className="text-xs opacity-60 truncate">
              {post.author?.title || "Veterinary Professional"} · {formatDate(post.created_at)}{edited ? " · edited" : ""} · {post.post_category}
            </div>
          </div>
        </div>
        
        {isAuthor && (
          <div className="flex gap-2 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-white/10 text-slate-200" : "bg-[#E8F8F5] text-[#0B3760]"}`} aria-label="Edit post">
              <Edit3 size={15} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(post.id); }} className={`h-9 w-9 rounded-full grid place-items-center ${darkMode ? "bg-red-500/15 text-red-200" : "bg-red-50 text-red-600"}`} aria-label="Delete post">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {post.body && <p className="text-sm leading-6 whitespace-pre-wrap opacity-85">{post.body}</p>}

      {post.attachment_urls?.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {post.attachment_urls.map((path, idx) => {
            const url = imageUrls[path];
            if (!url) return <div key={idx} className="h-24 w-24 bg-black/5 rounded animate-pulse" />;
            return (
              <button key={idx} onClick={() => onOpenImage(url)} className="relative h-24 w-24 rounded-lg overflow-hidden border border-black/10 hover:opacity-90 transition">
                <img src={url} alt="Attached media" className="h-full w-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}

      {(post.shared_title || post.shared_type) && (
        <div className={`rounded-lg border p-3 ${darkMode ? "bg-white/5 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]"}`}>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); if (opensSharedModal) onOpenShared(); }} 
            disabled={!opensSharedModal && !sharedUrl} 
            className={`w-full text-left flex items-start gap-3 disabled:cursor-default ${opensSharedModal || sharedUrl ? "cursor-pointer" : ""}`}
          >
            <div className={`${darkMode ? "bg-white/10 text-[#71CFC2]" : "bg-white text-[#0F8F83]"} rounded-lg p-2 shrink-0`}><FileText size={16} /></div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-50">{shareLabel}</p>
              <p className="font-black text-sm truncate">{post.shared_title || "Shared resource"}</p>
              {opensSharedModal ? (
                <span className="mt-1 inline-block text-xs font-black text-[#0F8F83] dark:text-[#71CFC2]">Open shared item</span>
              ) : sharedUrl ? (
                <Link to={sharedUrl} onClick={(e) => e.stopPropagation()} className="mt-1 inline-block text-xs font-black text-[#0F8F83] dark:text-[#71CFC2]">Open shared item</Link>
              ) : (
                <span className="mt-1 block text-xs opacity-55">This older attachment has no preview. Ask author to reattach.</span>
              )}
            </div>
          </button>
        </div>
      )}
    </article>
  );
}

function SharedAttachmentModal({ post, user, darkMode, onClose }) {
  const [saving, setSaving] = useState(false);
  const payload = post.shared_payload || {};
  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  const softClass = darkMode ? "bg-white/10 border-white/10" : "bg-[#F0F6F5] border-[#DCEDEA]";

  const saveSharedItem = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    
    const isCase = post.shared_type === "caselog";
    const table = isCase ? "caselogs" : "protocols";
    
    const payloadToInsert = isCase 
      ? { 
          user_id: user.id, 
          title: `${post.shared_title || payload.title || "Shared case"} (shared)`, 
          category: payload.category || "Other", 
          patient_name: null, 
          species: payload.species || null, 
          breed: payload.breed || null, 
          age: payload.age || null, 
          gender: payload.gender || null, 
          description: payload.description || null, 
          media_urls: [] 
        }
      : { 
          user_id: user.id, 
          name: `${post.shared_title || payload.name || "Shared protocol"} (shared)`, 
          indication: payload.indication || "", 
          drug_ids: Array.isArray(payload.drug_ids) ? payload.drug_ids : [], 
          drug_doses: payload.drug_doses && typeof payload.drug_doses === "object" ? payload.drug_doses : {} 
        };

    const { error } = await supabase.from(table).insert(payloadToInsert);
    setSaving(false);
    
    if (error) return toast.error(`Could not save shared ${isCase ? "case" : "protocol"}`);
    toast.success(`Saved to your ${isCase ? "case logs" : "protocols"}`);
    onClose();
  };

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

        {(post.shared_type === "caselog" || post.shared_type === "protocol") && (
          <button onClick={saveSharedItem} disabled={saving} className="mt-5 w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <PlusCircle size={18} />} {post.shared_type === "caselog" ? "Add to my Case Logs" : "Save to my Protocols"}
          </button>
        )}
      </div>
    </div>
  );
}

function PostImagePreviewModal({ url, darkMode, onClose }) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur flex items-center justify-center p-4 animate-in fade-in" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 bg-white/10 text-white rounded-full p-2 hover:bg-white/20 transition">
        <X size={24} />
      </button>
      <img src={url} alt="Expanded preview" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function GdprImageWarningModal({ darkMode, onCancel, onConfirm }) {
  const modalClass = darkMode ? "bg-[#0B242B] text-white" : "bg-white text-[#113247]";
  
  return (
    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl border ${darkMode ? "border-white/10" : "border-[#DCEDEA]"} ${modalClass}`}>
        <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 grid place-items-center mb-4">
          <AlertTriangle size={24} />
        </div>
        <h3 className="text-xl font-black mb-2">Check for sensitive data</h3>
        <p className="text-sm opacity-80 leading-6 mb-6">
          Before posting images, confirm they do not contain client names, owner details, addresses, phone numbers, microchip numbers, labels, consent forms, invoices, or other identifiable personal data. Redact anything sensitive before sharing.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onConfirm} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black transition hover:opacity-90">
            I confirm, post images
          </button>
          <button onClick={onCancel} className={`w-full rounded-lg p-3 font-black transition ${darkMode ? "bg-white/10 hover:bg-white/20" : "bg-[#F0F6F5] hover:bg-[#E8F8F5]"}`}>
            Cancel
          </button>
        </div>
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
      id: item.id, title: item.title, category: item.category, species: item.species, 
      breed: item.breed, age: item.age, gender: item.gender, description: item.description, 
      created_at: item.created_at 
    };
  }
  return { 
    id: item.id, name: item.name, indication: item.indication, 
    drug_ids: item.drug_ids, drug_doses: item.drug_doses, created_at: item.created_at 
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
            {connections.map(c => (
              <div key={c.connection_id} className={`${panelClass} flex justify-between items-center gap-4`}>
                <button onClick={() => onOpenProfile(c.colleague)} className="min-w-0 flex-1 text-left flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-[#E8F8F5] text-[#0F8F83] grid place-items-center shrink-0 overflow-hidden font-black">
                    {c.colleague?.avatar_url ? <img src={c.colleague.avatar_url} alt="" className="h-full w-full object-cover" /> : c.colleague?.full_name?.charAt(0) || <UserRound size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.colleague?.title} {c.colleague?.full_name}</div>
                    <div className="text-xs opacity-60 truncate">{c.colleague?.email || "Connected colleague"}</div>
                  </div>
                </button>
                <div className="flex gap-2 shrink-0">
                  <Link to={`/messages?colleague=${c.colleague?.id}`} className={`h-10 w-10 rounded-full grid place-items-center transition ${darkMode ? "bg-white/10 text-[#71CFC2] hover:bg-white/15" : "bg-[#E8F8F5] text-[#0F8F83] hover:bg-white"}`}><MessageSquare size={18} /></Link>
                  <IconButton icon={busyId === c.connection_id ? Loader2 : Trash2} variant="danger" darkMode={darkMode} disabled={busyId === c.connection_id} onClick={() => onRemoveConnection(c.connection_id)} />
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
      <SearchBox darkMode={darkMode} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search colleagues by name..." icon={searching ? Loader2 : Search} />
      
      {searchQuery.trim().length > 2 && searchResults.length === 0 && !searching && (
        <div className="text-center opacity-60 py-4 text-sm">No new colleagues found matching "{searchQuery}"</div>
      )}
      
      {searchResults.length > 0 && (
        <section className="space-y-2">
          {searchResults.map(result => (
            <div key={result.id} className={`${panelClass} flex justify-between items-center`}>
              <div>
                <div className="font-bold text-lg">{result.title} {result.full_name}</div>
                <div className="text-xs opacity-70">{result.qualifications || "Veterinary Professional"}</div>
              </div>
              {sentRequests.includes(result.id) ? (
                <AppButton disabled variant="secondary" darkMode={darkMode}>Pending</AppButton>
              ) : (
                <AppButton onClick={() => onSendRequest(result.id)} disabled={busyId === result.id} icon={busyId === result.id ? Loader2 : UserPlus} variant="secondary" darkMode={darkMode}>Connect</AppButton>
              )}
            </div>
          ))}
        </section>
      )}

      {(requests.length > 0 || sentRequestDetails.length > 0) && (
        <section className="space-y-3 mt-8">
          <h3 className="text-sm font-black uppercase tracking-widest opacity-60 flex items-center gap-2"><UserPlus size={16}/> Pending Requests</h3>
          
          {requests.map(request => (
            <div key={request.id} className={`${panelClass} flex justify-between items-center border-l-4 border-[#0F8F83]`}>
              <div className="min-w-0">
                <div className="font-bold text-lg truncate">{request.requester?.title} {request.requester?.full_name}</div>
                <div className="text-xs opacity-70 truncate">{request.requester?.qualifications || "Veterinary Professional"}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#0F8F83] mt-1">Waiting for your response</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <AppButton onClick={() => onRespond(request.id, "accepted")} icon={busyId === request.id ? Loader2 : Check} darkMode={darkMode}>Accept</AppButton>
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
            
            {colleague?.bio && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">About</h3>
                <p className="text-sm leading-6 opacity-80 whitespace-pre-wrap">{colleague.bio}</p>
              </section>
            )}
            
            {(colleague?.areas_of_interest || colleague?.memberships || colleague?.rcvs_number) && (
              <section className={`rounded-lg border p-4 ${softClass}`}>
                <h3 className="text-xs font-black uppercase tracking-widest opacity-50 mb-2">Professional Details</h3>
                {colleague?.rcvs_number && <p className="text-sm mb-2"><span className="font-black opacity-60">RCVS: </span>{colleague.rcvs_number}</p>}
                {colleague?.areas_of_interest && <p className="text-sm mb-2"><span className="font-black opacity-60">Interests: </span>{colleague.areas_of_interest}</p>}
                {colleague?.memberships && <p className="text-sm"><span className="font-black opacity-60">Memberships: </span>{colleague.memberships}</p>}
              </section>
            )}
            
            <Link to={`/messages?colleague=${colleague?.id}`} className="w-full rounded-lg bg-[#71CFC2] text-[#062F63] p-3 font-black flex items-center justify-center gap-2 transition hover:opacity-90">
              <MessageSquare size={18} /> Message Colleague
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value, softClass, isLink = false }) {
  if (!value) return null;
  const content = isLink ? (
    <a href={value.startsWith("http") ? value : `https://${value}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#0F8F83] hover:underline break-all">
      {value}
    </a>
  ) : (
    <div className="text-sm font-bold break-words">{value}</div>
  );
  
  return (
    <div className={`rounded-lg border p-3 flex items-start gap-3 ${softClass}`}>
      <div className="mt-0.5 text-[#0F8F83] shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-black uppercase tracking-widest opacity-50 mb-1">{label}</div>
        {content}
      </div>
    </div>
  );
}