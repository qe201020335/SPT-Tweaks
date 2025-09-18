using System.Collections.Generic;
using JetBrains.Annotations;
using SemanticVersioning;
using SPTarkov.Server.Core.Models.Spt.Mod;

namespace SPTTweaks;

[UsedImplicitly]
public partial record PluginMetadata : AbstractModMetadata
{
    public override string ModGuid { get; init; } = "com.github.qe201020335.spttweaks";
    public override string Name { get; init; } = "SPTTweaks";
    public override string Author { get; init; } = "qe201020335";
    public override List<string>? Contributors { get; init; }
    public override Version SptVersion { get; init; } = new(4, 0, 0);
    public override List<string>? Incompatibilities { get; init; }
    public override Dictionary<string, Version>? ModDependencies { get; init; }
    public override string? Url { get; init; } = "https://github.com/qe201020335/SPT-Tweaks";
    public override bool? IsBundleMod { get; init; } = false;
    public override string License { get; init; } = "MIT";
}