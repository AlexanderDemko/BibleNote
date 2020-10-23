using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Analytics.Common.DiContainer
{
    public abstract class ModuleBase
    {
        internal protected abstract void InitServices(IServiceCollection services);       
    }
}
