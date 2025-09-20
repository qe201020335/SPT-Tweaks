using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace SPTTweaks.Configuration;

internal class PluginConfig
{
    public NetworkConfig Network { get; init; } = new();
    public ProfileConfig Profile { get; init; } = new();
}

internal abstract class DisableableConfig
{
    [JsonPropertyOrder(-99)]
    public virtual bool Enable { get; set; }

    public static implicit operator bool(DisableableConfig config) => config.Enable;
}

internal class NetworkConfig : DisableableConfig
{
    public string ListenIp { get; set; } = "127.0.0.1";

    public string BackendIp { get; set; } = "127.0.0.1";
}

internal class ProfileConfig : DisableableConfig
{
    public ProfileHealth Health { get; init; } = new();

    internal class ProfileHealth
    {
        public float HealthMultiplier { get; set; } = 1.0f;

        public float EnergyMultiplier { get; set; } = 1.0f;

        public float HydrationMultiplier { get; set; } = 1.0f;

        public bool Immortal { get; set; } = false;

        public bool UseExactValues { get; set; } = false;

        public ExactHealthValues ExactValues { get; init; } = new();
    }

    internal class ExactHealthValues
    {
        public IReadOnlyDictionary<string, int> BodyParts { get; init; } = new Dictionary<string, int>
        {
            { "Head", 35 },
            { "Chest", 85 },
            { "Stomach", 70 },
            { "LeftArm", 60 },
            { "RightArm", 60 },
            { "LeftLeg", 65 },
            { "RightLeg", 65 }
        }.AsReadOnly();

        public int Energy { get; set; } = 100;

        public int Hydration { get; set; } = 100;
    }
}