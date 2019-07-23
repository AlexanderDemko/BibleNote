using BibleNote.Analytics.Contracts.Environment;
using BibleNote.Analytics.Contracts.Logging;
using BibleNote.Analytics.Contracts.ParallelVerses;
using BibleNote.Analytics.Contracts.VerseParsing;
using BibleNote.Analytics.Core.Extensions;
using BibleNote.Analytics.Data;
using BibleNote.Analytics.Models.Contracts.ParseContext;
using BibleNote.Analytics.Models.VerseParsing.ParseContext;
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

        private static void RegisterCoreServices()
        {
            var sourceName = typeof(DIContainer).Assembly.GetName().Name;
            Container.RegisterType<ILog, DiagnosticsLog>(new ContainerControlledLifetimeManager(), new InjectionConstructor(sourceName))
                .RegisterType<ITracer, DefaultTracer>(new ContainerControlledLifetimeManager());

            Container.AddNewExtension<Interception>();
            Container.RegisterType<IMatchingRule, AnyMatchingRule>();
            Container.RegisterType<ICallHandler, LogCallHandler>();

            Container.Configure<Interception>().AddPolicy("LogPolicy")
                .AddMatchingRule<AnyMatchingRule>()
                .AddCallHandler<LogCallHandler>();            
        }

        public static void InitWithDefaults()
        {
            RegisterCoreServices();

            Container
                .RegisterContextType<AnalyticsContext>()
                .RegisterTracingType<IConfigurationManager, ConfigurationManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IModulesManager, ModulesManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IBibleParallelTranslationManager, BibleParallelTranslationManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IVerseRecognitionService, VerseRecognitionService>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IVersePointerFactory, VersePointerFactory>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IApplicationManager, ApplicationManager>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IVerseCorrectionService, VerseCorrectionService>(new ContainerControlledLifetimeManager())
                .RegisterTracingType<IStringParser, StringParser>(new TransientLifetimeManager())
                .RegisterTracingType<IParagraphParser, ParagraphParser>(new TransientLifetimeManager())
                .RegisterTracingType<IDocumentParser, DocumentParser>(new TransientLifetimeManager())
                .RegisterTracingType<IDocumentParseContextEditor, DocumentParseContext>(new TransientLifetimeManager())
                .RegisterTracingType<IDocumentParserFactory, DocumentParserFactory>(new ContainerControlledLifetimeManager());
        }
        
        public static T Resolve<T>(params ResolverOverride[] overrides)
        {
            return Container.Resolve<T>(overrides);            
        }

        public static T Resolve<T>(string name, params ResolverOverride[] overrides)
        {
            return Container.Resolve<T>(name, overrides);
        }
    }
}
