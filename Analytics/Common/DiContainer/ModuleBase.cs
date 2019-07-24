using System.Collections.Generic;

namespace BibleNote.Analytics.Common.DiContainer
{
    public abstract class ModuleBase
    {
        protected abstract void InitServices(ServiceDescriptorsList services);

        public IEnumerable<Microsoft.Extensions.DependencyInjection.ServiceDescriptor> GetServices()
        {
            var services = new ServiceDescriptorsList();
            InitServices(services);

            foreach (var service in services)
            {
                yield return GetServiceDescriptor(service);
            }
        }

        private Microsoft.Extensions.DependencyInjection.ServiceDescriptor GetServiceDescriptor(ServiceDescriptor service)
        {
            return new Microsoft.Extensions.DependencyInjection.ServiceDescriptor(
                service.ServiceType,
                service.ImplementationType,
                (Microsoft.Extensions.DependencyInjection.ServiceLifetime)service.Lifetime);
        }
    }
}
