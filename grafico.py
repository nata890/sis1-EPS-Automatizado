import matplotlib.pyplot as plt
import networkx as nx

G = nx.Graph()

posiciones = {
    "Paciente\n(Barrio Milán)": (5.058, -75.485),
    "Sede Alta Suiza\n(Stock: 10)\n1.08 km": (5.062, -75.492),
    "Sede Centro\n(Stock: 5)\n3.72 km": (5.068, -75.517),
    "Sede Palermo\n(Stock: 0)": (5.055, -75.490) # Nodo podado
}

# Agregar nodos
G.add_nodes_from(posiciones.keys())

# Agregar aristas (conexiones del paciente a las sedes evaluadas)
G.add_edge("Paciente\n(Barrio Milán)", "Sede Alta Suiza\n(Stock: 10)\n1.08 km", weight=1.08)
G.add_edge("Paciente\n(Barrio Milán)", "Sede Centro\n(Stock: 5)\n3.72 km", weight=3.72)

# Dibujar el grafo
plt.figure(figsize=(10, 6))

# Dibujar nodos con colores semánticos
colores_nodos = ['#3498db', '#2ecc71', '#2ecc71', '#e74c3c'] # Azul (Paciente), Verdes (Stock), Rojo (Sin Stock)
nx.draw_networkx_nodes(G, posiciones, node_color=colores_nodos, node_size=3000, edgecolors='black')

# Dibujar etiquetas
nx.draw_networkx_labels(G, posiciones, font_size=10, font_weight="bold")

# Dibujar aristas normales
aristas_normales = [("Paciente\n(Barrio Milán)", "Sede Centro\n(Stock: 5)\n3.72 km")]
nx.draw_networkx_edges(G, posiciones, edgelist=aristas_normales, width=2, alpha=0.5, style="dashed")

# Dibujar la ruta óptima (A*) más gruesa y de color
ruta_optima = [("Paciente\n(Barrio Milán)", "Sede Alta Suiza\n(Stock: 10)\n1.08 km")]
nx.draw_networkx_edges(G, posiciones, edgelist=ruta_optima, width=4, edge_color='green')

# Configurar visualización
plt.title("Visualización del Algoritmo A* - Enrutamiento Óptimo de Medicamentos", fontsize=14, fontweight='bold')
plt.axis('off')
plt.tight_layout()

# Guardar la imagen
plt.savefig("grafo_a_star.png", dpi=300, bbox_inches='tight')
plt.show()