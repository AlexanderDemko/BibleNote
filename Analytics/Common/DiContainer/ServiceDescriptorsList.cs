using System.Collections.Generic;

namespace BibleNote.Analytics.Common.DiContainer
{
    public class ServiceDescriptorsList : List<ServiceDescriptor>
    {
        public ServiceDescriptorsList AddTransient<TService, TImplementation>()
        {
            this.Add(new ServiceDescriptor(typeof(TService), typeof(TImplementation)));
            return this;
        }

        public ServiceDescriptorsList AddScoped<TService, TImplementation>()
        {
            this.Add(new ServiceDescriptor(typeof(TService), typeof(TImplementation), ServiceLifetime.Scoped));
            return this;
        }

        public ServiceDescriptorsList AddSingleton<TService, TImplementation>()
        {
            this.Add(new ServiceDescriptor(typeof(TService), typeof(TImplementation), ServiceLifetime.Singleton));
            return this;
        }
    }
}
