using BibleNote.Core.Contracts;
using Microsoft.Practices.Unity;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Services.System
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

        public static void InitWithDefaults()
        {
            Container.RegisterType<ILogger, Logger>();
            Container.RegisterType<IConfigurationManager, ConfigurationManager>();
            Container.RegisterType<IModulesManager, ModulesManager>();
            Container.RegisterType<ITextParserService, TextParserService>();
            Container.RegisterType<IBibleParallelTranslationConnectorManager, BibleParallelTranslationConnectorManager>();
            Container.RegisterType<IBibleParallelTranslationManager, BibleParallelTranslationManager>();
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
