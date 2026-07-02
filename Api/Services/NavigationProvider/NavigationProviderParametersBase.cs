using BibleNote.Services.Contracts;
using Newtonsoft.Json;

namespace BibleNote.Services.NavigationProvider
{
    public abstract class NavigationProviderParametersBase : INavigationProviderParameters
    {
        public string GetParametersRaw() => JsonConvert.SerializeObject(this);

        public static P ReadParameters<P>(string parametersRaw) where P : INavigationProviderParameters
        {
            return JsonConvert.DeserializeObject<P>(parametersRaw);
        }
    }
}
