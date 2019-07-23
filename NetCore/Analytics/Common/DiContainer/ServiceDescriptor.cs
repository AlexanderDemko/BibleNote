using System;

namespace BibleNote.Analytics.Common.DiContainer
{
    public class ServiceDescriptor
    {
        public Type ServiceType { get; set; }

        public Type ImplementationType { get; set; }

        public ServiceLifetime Lifetime { get; set; }

        public ServiceDescriptor(Type serviceType, Type implementationType, ServiceLifetime serviceLifetime = ServiceLifetime.Transient)
        {
            this.ServiceType = serviceType;
            this.ImplementationType = implementationType;
            this.Lifetime = serviceLifetime;
        }
    }
}
