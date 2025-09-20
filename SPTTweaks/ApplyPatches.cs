using System.Threading.Tasks;
using SPTarkov.DI.Annotations;
using SPTarkov.Reflection.Patching;
using SPTarkov.Server.Core.Models.External;
using SPTarkov.Server.Core.Models.Utils;
using SPTTweaks.Configuration;

namespace SPTTweaks;

[Injectable]
internal class ApplyPatches(ISptLogger<ApplyPatches> logger, ConfigManager configManager, PatchManager patchManager)
    : IPreSptLoadModAsync
{
    private readonly PluginConfig _config = configManager.Config;

    Task IPreSptLoadModAsync.PreSptLoadAsync()
    {
        logger.Info("SPTTweaks PreSptLoad - Applying patches...");
        // apply patches
        patchManager.AutoPatch = true;
        patchManager.PatcherName = PluginMetadata.Guid;
        patchManager.EnablePatches();

        logger.Success("[SPTTweaks] Patches applied!");
        return Task.CompletedTask;
    }
}
