import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAssets, formatBytes, type AssetMetadata } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { ImageIcon, VideoIcon, Search, CheckCircle2, Play } from "lucide-react";

interface AssetPickerDialogProps {
    open: boolean;
    onClose: () => void;
    onSelect?: (url: string, description: string) => void;
    onSelectMultiple?: (assets: { url: string; description: string }[]) => void;
    filterType?: "image" | "video";
    multiSelect?: boolean;
}

export function AssetPickerDialog({
    open,
    onClose,
    onSelect,
    onSelectMultiple,
    filterType,
    multiSelect = false,
}: AssetPickerDialogProps) {
    const [assets, setAssets] = useState<AssetMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [activeTab, setActiveTab] = useState<"all" | "image" | "video">(
        filterType || "all"
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedAssets, setSelectedAssets] = useState<AssetMetadata[]>([]);

    const loadAssets = useCallback(async () => {
        setLoading(true);
        try {
            const results = await fetchAssets({
                filterType: activeTab === "all" ? undefined : activeTab,
                search: search.trim() || undefined,
                limit: 50,
            });
            setAssets(results);
            if (results.length === 0) {
                console.log("[AssetPicker] No assets returned for tab:", activeTab, "search:", search);
            }
        } finally {
            setLoading(false);
        }
    }, [activeTab, search]);

    // Load assets when dialog opens or tab/search changes
    useEffect(() => {
        if (open) {
            loadAssets();
            setSelectedId(null);
            setSelectedAssets([]);
        }
    }, [open, loadAssets]);

    // Debounced search
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(loadAssets, 300);
        return () => clearTimeout(timer);
    }, [search, open, loadAssets]);

    const handleSelect = (asset: AssetMetadata) => {
        if (multiSelect) {
            setSelectedAssets((prev) => {
                const isSelected = prev.some((a) => a.id === asset.id);
                if (isSelected) {
                    return prev.filter((a) => a.id !== asset.id);
                }
                return [...prev, asset];
            });
        } else {
            setSelectedId(asset.id);
            if (onSelect) {
                onSelect(asset.public_url, asset.description || "");
            }
            // Brief delay so user sees the selection before closing
            setTimeout(onClose, 200);
        }
    };

    const handleConfirmMultiSelect = () => {
        if (onSelectMultiple) {
            onSelectMultiple(
                selectedAssets.map((a) => ({
                    url: a.public_url,
                    description: a.description || "",
                }))
            );
        }
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5" />
                        Browse Asset Library
                    </DialogTitle>
                </DialogHeader>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                {/* Tabs — always shown */}
                <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "all" | "image" | "video")}
                >
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="all" className="flex items-center gap-2">
                            All
                        </TabsTrigger>
                        <TabsTrigger value="image" className="flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" /> Images
                        </TabsTrigger>
                        <TabsTrigger value="video" className="flex items-center gap-2">
                            <VideoIcon className="w-4 h-4" /> Videos
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Asset Grid */}
                <div className="flex-1 overflow-y-auto min-h-[300px]">
                    {loading ? (
                        <div className="grid grid-cols-3 gap-3 p-1">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="aspect-square rounded-lg" />
                            ))}
                        </div>
                    ) : assets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                            <ImageIcon className="w-12 h-12 mb-3 opacity-40" />
                            <p className="text-sm font-medium">No assets found</p>
                            <p className="text-xs mt-1">
                                {search
                                    ? "Try a different search term"
                                    : "Upload some files first"}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3 p-1">
                            {assets.map((asset) => (
                                <button
                                    key={asset.id}
                                    onClick={() => handleSelect(asset)}
                                    className={`
                                        relative group rounded-lg border-2 overflow-hidden
                                        transition-all duration-150 text-left
                                        hover:border-primary hover:shadow-md
                                        focus:outline-none focus:ring-2 focus:ring-primary
                                        ${(multiSelect ? selectedAssets.some(a => a.id === asset.id) : selectedId === asset.id)
                                            ? "border-primary ring-2 ring-primary"
                                            : "border-border"
                                        }
                                    `}
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                        {asset.file_type === "image" ? (
                                            <img
                                                src={asset.public_url}
                                                alt={asset.name}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : asset.file_type === "video" ? (
                                            <div className="w-full h-full relative bg-zinc-900">
                                                <video
                                                    src={asset.public_url}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    preload="metadata"
                                                    onLoadedData={(e) => {
                                                        const vid = e.currentTarget;
                                                        if (vid.duration > 1) vid.currentTime = 1;
                                                    }}
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                                                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                                        <Play className="h-4 w-4 text-zinc-800 ml-0.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-muted text-muted-foreground">
                                                <VideoIcon className="w-8 h-8" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Selected check */}
                                    {(multiSelect ? selectedAssets.some(a => a.id === asset.id) : selectedId === asset.id) && (
                                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5 shadow-md">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                    )}

                                    {/* Info overlay */}
                                    <div className="p-2 bg-background">
                                        <p className="text-xs font-medium truncate" title={asset.name}>
                                            {asset.name}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                {formatBytes(asset.file_size)}
                                            </Badge>
                                            {asset.ai_generated && (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    AI
                                                </Badge>
                                            )}
                                        </div>
                                        {asset.description && (
                                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                                {asset.description}
                                            </p>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer for Multi-Select */}
                {multiSelect && (
                    <div className="pt-4 border-t flex justify-end gap-2 mt-4 shrink-0">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmMultiSelect}
                            disabled={selectedAssets.length === 0}
                            className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                        >
                            Select {selectedAssets.length} Item{selectedAssets.length !== 1 ? "s" : ""}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
