﻿using Microsoft.Extensions.DependencyInjection;
using System;

namespace BibleNote.Analytics.Common.DiContainer
{
    public static class ServiceCollectionExtensions
    {
        public static IServiceCollection AddApplicatonServices<TModule>(this IServiceCollection services)
            where TModule : ModuleBase
        {
            var module = (ModuleBase)Activator.CreateInstance(typeof(TModule));

            module.InitServices(services);

            return services;
        }
    }
}
