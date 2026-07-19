# Guia de Desenvolvimento - Bot "Auto"

Este documento serve como um guia oficial de estilo e arquitetura para a criação de novos comandos, eventos e sistemas para o bot **Auto**. Qualquer desenvolvedor (ou IA) trabalhando neste projeto **DEVE** seguir rigorosamente estas diretrizes.

## 1. Identidade e Estilo Visual

O Auto é focado em ser limpo, sério e de alta performance. Seu foco é puramente em automação de comunidades de forma profissional.

*   **Zero Emojis:** Não utilize emojis em textos, títulos ou descrições (nada de `✅`, `❌`, `🎉`, etc.). A linguagem deve ser profissional, neutra e direta ao ponto.
*   **Apenas Embeds:** Toda e qualquer resposta a interações de comandos **DEVE** ser feita utilizando Embeds. O bot nunca deve responder com texto simples (plain text).
*   **Cores Padronizadas:** 
    *   Sempre importe e utilize o `createEmbed` do arquivo `src/utils/embedBuilder.ts` para garantir que a embed tenha a cor padrão oficial do bot (`#24242a`).
    *   **Exceção Única:** Apenas o sistema de **Sugestões** (e possíveis tickets) está autorizado a usar cores diferentes (ex: Verde para aprovado, Vermelho para rejeitado). Nos demais comandos, mantenha o padrão neutro do construtor.

## 2. Padrão de Comandos (Slash Commands)

Todos os comandos devem estar localizados em subpastas de `src/commands/` (ex: `admin`, `community`, `utilities`).

*   **Exportação:** Siga o padrão exportando `data` (o `SlashCommandBuilder`) e a função `execute`.
*   **Segurança (Permissões):**
    *   Comandos administrativos (como setar canais, criar cargos) **devem** usar o método `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` (ou similar, como `ManageMessages`) no `SlashCommandBuilder` para garantir que apenas administradores consigam vê-los e executá-los.
    *   No caso de subcomandos, o Discord não permite definir permissões individuais pelo Builder. Verifique as permissões manualmente dentro da execução com `interaction.memberPermissions?.has(...)`.
*   **Validação Inicial:** Sempre faça o early-return caso não seja em um servidor: `const guildId = interaction.guildId; if (!guildId) return;`
*   **Silencioso (Ephemeral):** Use `flags: 64` (Ephemeral) na resposta de interações de configuração, para não poluir o chat quando um Admin estiver configurando o bot.

### Exemplo de Resposta de Comando Correto:
```typescript
await interaction.reply({
    embeds: [createEmbed(interaction).setDescription('O canal de avisos foi configurado com sucesso.')],
    flags: 64
});
```

## 3. Banco de Dados (SQLite)

O projeto utiliza `better-sqlite3`. Toda iteração com o banco deve ser síncrona.

*   **Nunca resete dados:** Em caso de novas tabelas ou colunas, utilize instruções `CREATE TABLE IF NOT EXISTS` ou `ALTER TABLE` via script de migração.
*   O arquivo de banco se chama `data.db`. Ele **nunca** deve ser sobrescrito ao realizar atualizações.

## 4. Agendamentos e Cron Jobs

O Auto centraliza as execuções de tempo através de um agendador (`scheduler.ts`).

*   **Evite setTimeout/setInterval soltos:** Para funções baseadas em tempo (como agendar envio de mensagens, lembretes, aniversários), insira o evento na tabela `scheduled_tasks` do banco de dados para que ele não se perca caso o bot reinicie.
*   O evento `scheduler.ts` roda a cada minuto conferindo a coluna `next_run` e executando o que estiver pendente.

## 5. Empacotamento para a Host (Deploy)

Sempre que a lógica do bot for finalizada e ele estiver pronto para ir para a provedora de Host (Discloud, SquareCloud, etc.):

*   Gere o `.zip` excluindo pastas e arquivos pesados/sensíveis.
*   **Comando Oficial de Deploy:**
    ```bash
    rm -f bot_host.zip && zip -r bot_host.zip . -x "node_modules/*" -x "data.db" -x ".git/*" -x "site/*" -x "assets/*"
    ```
*   **Importante:** A flag `-x "data.db"` é sagrada. Ela garante que, quando o usuário fizer o upload, a host não delete os dados salvos e zere as configurações, permissões e lembretes dos servidores ativos.
