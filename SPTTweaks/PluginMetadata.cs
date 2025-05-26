using JetBrains.Annotations;
using SPTarkov.Server.Core.Models.Spt.Mod;

namespace SPTTweaks;

[UsedImplicitly]
public record PluginMetadata : AbstractModMetadata
{
    public override string? Name { get; set; } = "SPTTweaks";
    public override string? Author { get; set; } = "qe201020335";
    public override List<string>? Contributors { get; set; }
    public override string? Version { get; set; } = "2.0.0";
    public override string? SptVersion { get; set; } = "~4.0.0";
    public override List<string>? LoadBefore { get; set; }
    public override List<string>? LoadAfter { get; set; }
    public override List<string>? Incompatibilities { get; set; }
    public override Dictionary<string, string>? ModDependencies { get; set; }
    public override string? Url { get; set; } = "https://github.com/qe201020335/SPT-Tweaks";
    public override bool? IsBundleMod { get; set; } = false;
    public override string? Licence { get; set; } = "MIT";
}