using Microsoft.Extensions.DependencyInjection;
using System;

namespace BibleNote.Analytics.Common.DiContainer
{
    public static class ServiceCollectionExtensions
    {
        public static void AddApplicatonServices<TModule>(this IServiceCollection services)
            where TModule : ModuleBase
        {
            var module = (ModuleBase)Activator.CreateInstance(typeof(TModule));

            foreach (var service in module.GetServices())
                services.Add(service);
        }
    }
}
