using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.Logging;
using BibleNote.Analytics.Contracts.ParallelVerses;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Services.Environment;
using BibleNote.Analytics.Services.Logging;
using BibleNote.Analytics.Services.ParallelVerses;
using BibleNote.Analytics.Services.VerseParsing;
using Microsoft.Practices.Unity;
using Microsoft.Practices.Unity.InterceptionExtension;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.Unity
{
    /// <summary>
    /// Simple wrapper for unity resolution.
    /// </summary>
    public class DIContainer
    {        
        public static IUnityContainer Container { get; private set; }        

        /// <summary>
        /// Static constructor for DependencyFactory which will 
        /// initialize the unity container.
        /// </summary>
        static DIContainer()
        {
            Container = new UnityContainer();                                   
        }

        public static void RegisterCoreServices(UnityContainer container)
        {
            var sourceName = typeof(DIContainer).Assembly.GetName().Name;
            container.RegisterType<ILog, DiagnosticsLog>(new ContainerControlledLifetimeManager(), new InjectionConstructor(sourceName))
                .RegisterType<ITracer, DefaultTracer>(new ContainerControlledLifetimeManager());

            container.AddNewExtension<Interception>();
            container.RegisterType<IMatchingRule, AnyMatchingRule>();
            container.RegisterType<ICallHandler, LogCallHandler>();

            container.Configure<Interception>().AddPolicy("LogPolicy")
                .AddMatchingRule<AnyMatchingRule>()
                .AddCallHandler<LogCallHandler>();            
        }

        public static void InitWithDefaults()
        {
            Container
                .RegisterTracingType<IConfigurationManager, ConfigurationManager>(new ContainerControlledLifetimeManager(), new InjectionConstructor(true))
                .RegisterTracingType<IModulesManager, ModulesManager>(new ContainerControlledLifetimeManager())                
                .RegisterTracingType<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IBibleParallelTranslationManager, BibleParallelTranslationManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IVerseRecognitionService, VerseRecognitionService>(new TransientLifetimeManager())
                .RegisterTracingType<IStringParser, StringParser>(new TransientLifetimeManager())
                .RegisterTracingType<IVersePointerFactory, VersePointerFactory>(new TransientLifetimeManager())
                .RegisterTracingType<IParagraphParser, ParagraphParser>(new TransientLifetimeManager())
                .RegisterTracingType<IApplicationManager, ApplicationManager>(new ContainerControlledLifetimeManager());
        }

        /// <summary>
        /// Resolves the type parameter T to an instance of the appropriate type.
        /// </summary>
        /// <typeparam name="T">Type of object to return</typeparam>
        public static T Resolve<T>()
        {
            return Container.Resolve<T>();            
        }
    }
}
