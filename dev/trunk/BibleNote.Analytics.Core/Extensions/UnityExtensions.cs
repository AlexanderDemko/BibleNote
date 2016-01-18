using Microsoft.Practices.Unity;
using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Extensions
{
    public static class UnityExtensions
    {
        public static IUnityContainer RegisterContextType<TFrom, TTo>(this IUnityContainer container, LifetimeManager manager = null, params InjectionMember[] injections) where TTo : TFrom
        {
            return container.RegisterType<TFrom, TTo>(manager ?? new HierarchicalLifetimeManager(), injections);
        }

        public static IUnityContainer RegisterContextType<T>(this IUnityContainer container, LifetimeManager manager = null, params InjectionMember[] injections)
        {
            return container.RegisterType<T>(manager ?? new HierarchicalLifetimeManager(), injections);
        }

        public static IUnityContainer RegisterTracingType<TFrom, TTo>(this IUnityContainer container, LifetimeManager manager = null, params InjectionMember[] injections) where TTo : TFrom
        {
            container.RegisterContextType<TFrom, TTo>(manager, injections);
            ConfigureInterception<TFrom>(container);
            return container;
        }

        public static IUnityContainer RegisterTracingType<T>(this IUnityContainer container, LifetimeManager manager = null, params InjectionMember[] injections)
        {
            container.RegisterContextType<T>(manager, injections);
            ConfigureInterception<T>(container);
            return container;
        }

        private static void ConfigureInterception<T>(IUnityContainer container)
        {
            var interception = container.Configure<Interception>();
            if (typeof(T).IsInterface)
                interception.SetDefaultInterceptorFor<T>(new InterfaceInterceptor());
            else
                interception.SetDefaultInterceptorFor<T>(new VirtualMethodInterceptor());
        }
    }
}
