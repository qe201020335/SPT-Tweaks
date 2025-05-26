using System.Text.Json.Serialization;

namespace SPTTweaks.Configuration;

internal class PluginConfig
{
    public NetworkConfig Network { get; set; } = new();
}

internal abstract class DisableableConfig
{
    [JsonPropertyOrder(-99)]
    public virtual bool Enable { get; set; }
}

internal class NetworkConfig : DisableableConfig
{
    public string ListenIp { get; set; } = "127.0.0.1";

    public string BackendIp { get; set; } = "127.0.0.1";
}