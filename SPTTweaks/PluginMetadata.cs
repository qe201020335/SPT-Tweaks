using System.Collections.Generic;
using JetBrains.Annotations;
using SemanticVersioning;
using SPTarkov.Server.Core.Models.Spt.Mod;

namespace SPTTweaks;

[UsedImplicitly]
public record PluginMetadata : AbstractModMetadata
{
    public override string ModGuid { get; init; } = "com.github.qe201020335.spttweaks";
    public override string Name { get; init; } = "SPTTweaks";
    public override string Author { get; init; } = "qe201020335";
    public override List<string>? Contributors { get; set; }
    public override Version Version { get; } = new(2, 0, 0);
    public override Version SptVersion { get; } = new(4, 0, 0);
    public override List<string>? LoadBefore { get; set; }
    public override List<string>? LoadAfter { get; set; }
    public override List<string>? Incompatibilities { get; set; }
    public override Dictionary<string, Version>? ModDependencies { get; set; }
    public override string? Url { get; set; } = "https://github.com/qe201020335/SPT-Tweaks";
    public override bool? IsBundleMod { get; set; } = false;
    public override string License { get; init; } = "MIT";
}