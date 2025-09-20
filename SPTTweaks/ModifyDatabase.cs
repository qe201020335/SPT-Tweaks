using System.Threading.Tasks;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Services;
using SPTTweaks.Configuration;
using SPTTweaks.Utils;

namespace SPTTweaks;

[Injectable(TypePriority = OnLoadOrder.Database + 1)]
internal class ModifyDatabase(
    ISptLogger<ModifyDatabase> logger,
    ConfigManager configManager,
    DatabaseService databaseService) : IOnLoad
{
    private readonly PluginConfig _config = configManager.Config;

    Task IOnLoad.OnLoad()
    {
        logger.Info("Modifying database...");
        ModifyProfile();
        // TODO add more modifications here
        logger.Success("Database modification done!");
        return Task.CompletedTask;
    }

    private void ModifyProfile()
    {
        if (!_config.Profile) return;
        var profileConfig = _config.Profile;
        var profiles = databaseService.GetProfileTemplates();

        var healthConfig = profileConfig.Health;

        void ModifyHealth(BotBaseHealth? health)
        {
            if (health == null) return;
            health.Immortal = healthConfig.Immortal;
            if (healthConfig.UseExactValues)
            {
                var values = healthConfig.ExactValues;
                health.Energy?.SetCurrentMinMax(max: values.Energy);
                health.Hydration?.SetCurrentMinMax(max: values.Hydration);
                if (health.BodyParts != null)
                {
                    foreach (var bodyPart in values.BodyParts)
                    {
                        if (health.BodyParts.TryGetValue(bodyPart.Key, out var bodyPartHealth))
                        {
                            bodyPartHealth.Health?.SetCurrentMinMax(max: bodyPart.Value);
                        }
                        else
                        {
                            logger.Warning($"Body part <{bodyPart.Key}> not found in profile");
                        }
                    }
                }
            }
            else
            {
                health.Energy?.SetCurrentMinMax(max: health.Energy?.Maximum * healthConfig.EnergyMultiplier);
                health.Hydration?.SetCurrentMinMax(max: health.Hydration?.Maximum * healthConfig.HydrationMultiplier);
                if (health.BodyParts != null)
                {
                    var multiplier = healthConfig.HealthMultiplier;
                    foreach (var bodyPart in health.BodyParts.Values)
                    {
                        bodyPart.Health?.SetCurrentMinMax(max: bodyPart.Health?.Maximum * multiplier);
                    }
                }
            }
        }

        foreach (var keyValuePair in profiles)
        {
            logger.Info($"Modifying {keyValuePair.Key}");
            var profile = keyValuePair.Value;
            ModifyHealth(profile.Bear?.Character?.Health);
            ModifyHealth(profile.Usec?.Character?.Health);
        }
    }
}
